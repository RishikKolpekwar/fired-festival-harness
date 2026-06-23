"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { streamChat, streamBriefGenerate, type StreamHandlers } from "@/lib/sse";
import { type ChatMessage, makeId } from "@/lib/chat-model";
import type { Alarm, Brief, Health, Thread } from "@/lib/types";

export type CanvasState = {
  open: boolean;
  kind: "brief" | "pipeline";
  brief: Brief | null;
};

export function useHarness() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [canvas, setCanvas] = useState<CanvasState>({
    open: false,
    kind: "brief",
    brief: null,
  });
  const [latestBrief, setLatestBrief] = useState<Brief | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // mirror `streaming` into a ref so the focus/poll brief refetch can skip
  // while a generation is in flight (don't clobber the streamed brief).
  const streamingRef = useRef(false);

  const hasStarted = messages.length > 0;

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  /** Patch a message in place by id. */
  const patch = useCallback(
    (id: string, fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    },
    [],
  );

  // ---- bootstrap: health, threads, latest brief ----
  const refreshHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
      setHealthError(false);
    } catch {
      setHealthError(true);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      const { threads } = await api.listThreads();
      setThreads(threads);
    } catch {
      /* backend down — leave threads as-is */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, state set after await (not a sync cascade)
    refreshHealth();
    refreshThreads();
    const t = setInterval(refreshHealth, 20_000);
    return () => clearInterval(t);
  }, [refreshHealth, refreshThreads]);

  // Pull the latest stored brief. Skipped while a generation streams so a
  // focus/poll refetch can't overwrite the fresh brief mid-stream.
  const refreshBrief = useCallback(async () => {
    if (streamingRef.current) return;
    try {
      const { brief } = await api.latestBrief();
      if (brief) setLatestBrief(brief);
    } catch {
      /* ignore — backend may be down */
    }
  }, []);

  // Keep the brief fresh: load on mount, refetch on window focus / tab
  // visibility, and lightly poll while the tab is open. The backend
  // self-heals a missed 7am cron, so this surfaces today's brief instead of a
  // cached stale payload (e.g. after the Mac wakes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, state set after await (not a sync cascade)
    refreshBrief();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshBrief();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(onVisible, 120_000);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
    };
  }, [refreshBrief]);

  // ---- shared SSE handler factory ----
  const makeHandlers = useCallback(
    (assistantId: string): StreamHandlers => ({
      onStatus: (e) =>
        patch(assistantId, (m) => {
          const lines = [...(m.toolLines ?? [])];
          const i = lines.findIndex((l) => l.id === e.id);
          const line = { id: e.id, label: e.label, tool: e.tool, state: e.state };
          if (i === -1) lines.push(line);
          else lines[i] = line;
          return { ...m, toolLines: lines };
        }),
      onToken: (e) =>
        patch(assistantId, (m) => ({ ...m, content: m.content + e.text })),
      onCheckpoint: (e) =>
        patch(assistantId, (m) => ({
          ...m,
          checkpoints: [...(m.checkpoints ?? []), e],
        })),
      onAlarm: (a) => {
        setAlarms((prev) => [a, ...prev].slice(0, 30));
        patch(assistantId, (m) => ({ ...m, alarms: [...(m.alarms ?? []), a] }));
      },
      onCanvas: (e) => {
        const brief = e.kind === "brief" ? (e.payload as Brief) : null;
        if (brief) setLatestBrief(brief);
        setCanvas({ open: true, kind: e.kind, brief });
        patch(assistantId, (m) => ({ ...m, canvasKind: e.kind }));
      },
      onDone: (e) => {
        if (e.threadId) setThreadId(e.threadId);
        patch(assistantId, (m) => ({
          ...m,
          streaming: false,
          usedTools: e.usedTools,
          content:
            m.content ||
            (m.canvasKind ? "Opened the canvas →" : "Done."),
        }));
        setStreaming(false);
        refreshThreads();
      },
      onError: (e) =>
        patch(assistantId, (m) => ({
          ...m,
          streaming: false,
          error: e.message,
        })),
      onTransportError: (err) => {
        patch(assistantId, (m) => ({
          ...m,
          streaming: false,
          error:
            err.message.includes("fetch") || err.message.includes("network")
              ? "Couldn't reach the harness at " +
                (process.env.NEXT_PUBLIC_HARNESS_URL ?? "localhost:8787") +
                ". Is the backend running?"
              : err.message,
        }));
        setStreaming(false);
        setHealthError(true);
      },
    }),
    [patch, refreshThreads],
  );

  // ---- send a chat message ----
  const send = useCallback(
    async (text: string) => {
      if (streaming || !text.trim()) return;
      const userMsg: ChatMessage = {
        id: makeId("u"),
        role: "user",
        content: text.trim(),
        ts: new Date().toISOString(),
      };
      const assistantId = makeId("a");
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        ts: new Date().toISOString(),
        streaming: true,
        toolLines: [],
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      await streamChat(
        { message: text.trim(), threadId },
        makeHandlers(assistantId),
        controller.signal,
      );
    },
    [streaming, threadId, makeHandlers],
  );

  // ---- generate a fresh brief (streams, ends in a canvas event) ----
  const generateBrief = useCallback(async () => {
    if (streaming) return;
    const assistantId = makeId("a");
    setMessages((prev) => [
      ...prev,
      {
        id: makeId("u"),
        role: "user",
        content: "Generate my morning brief.",
        ts: new Date().toISOString(),
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        ts: new Date().toISOString(),
        streaming: true,
        toolLines: [],
      },
    ]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    await streamBriefGenerate(makeHandlers(assistantId), controller.signal);
  }, [streaming, makeHandlers]);

  // ---- load a past thread into the message list ----
  const loadThread = useCallback(async (id: string) => {
    try {
      const t = await api.getThread(id);
      setThreadId(t.id);
      setMessages(
        t.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          ts: m.ts,
          usedTools: m.usedTools,
        })),
      );
      setCanvas((c) => ({ ...c, open: false }));
    } catch {
      /* ignore */
    }
  }, []);

  const newThread = useCallback(() => {
    abortRef.current?.abort();
    setThreadId(undefined);
    setMessages([]);
    setCanvas((c) => ({ ...c, open: false }));
    setStreaming(false);
  }, []);

  const openBriefCanvas = useCallback(() => {
    if (latestBrief)
      setCanvas({ open: true, kind: "brief", brief: latestBrief });
  }, [latestBrief]);

  const closeCanvas = useCallback(
    () => setCanvas((c) => ({ ...c, open: false })),
    [],
  );

  // Approve an outbound draft (the only mutation the frontend may trigger).
  const approveDraft = useCallback(async (id: string) => {
    try {
      await api.approveDraft(id);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    // state
    messages,
    threads,
    threadId,
    streaming,
    health,
    healthError,
    alarms,
    canvas,
    latestBrief,
    hasStarted,
    // actions
    send,
    generateBrief,
    loadThread,
    newThread,
    openBriefCanvas,
    closeCanvas,
    approveDraft,
    refreshThreads,
  };
}
