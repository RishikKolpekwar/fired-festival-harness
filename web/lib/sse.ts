// Fetch-based SSE client for the harness chat + brief streams.
//
// We can't use EventSource because the contract streams are POST requests.
// So we read the response body as a stream and parse `event:`/`data:` frames
// ourselves, dispatching to typed handlers.

import { HARNESS_URL } from "./api";
import type {
  CanvasEvent,
  CheckpointEvent,
  DoneEvent,
  ErrorEvent,
  StatusEvent,
  TokenEvent,
} from "./types";
import type { Alarm } from "./types";

export type StreamHandlers = {
  onStatus?: (e: StatusEvent) => void;
  onToken?: (e: TokenEvent) => void;
  onCheckpoint?: (e: CheckpointEvent) => void;
  onAlarm?: (e: Alarm) => void;
  onCanvas?: (e: CanvasEvent) => void;
  onDone?: (e: DoneEvent) => void;
  onError?: (e: ErrorEvent) => void;
  /** Fired for transport-level failures (network down, non-200, aborted). */
  onTransportError?: (err: Error) => void;
};

type ParsedFrame = { event: string; data: string };

/** Parse one raw SSE frame (lines between blank-line separators). */
function parseFrame(raw: string): ParsedFrame | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue; // comment / heartbeat
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0 && event === "message") return null;
  return { event, data: dataLines.join("\n") };
}

function dispatch(frame: ParsedFrame, handlers: StreamHandlers) {
  let payload: unknown = {};
  if (frame.data) {
    try {
      payload = JSON.parse(frame.data);
    } catch {
      // Non-JSON data line — ignore but don't crash the stream.
      return;
    }
  }
  switch (frame.event) {
    case "status":
      handlers.onStatus?.(payload as StatusEvent);
      break;
    case "token":
      handlers.onToken?.(payload as TokenEvent);
      break;
    case "checkpoint":
      handlers.onCheckpoint?.(payload as CheckpointEvent);
      break;
    case "alarm":
      handlers.onAlarm?.(payload as Alarm);
      break;
    case "canvas":
      handlers.onCanvas?.(payload as CanvasEvent);
      break;
    case "done":
      handlers.onDone?.(payload as DoneEvent);
      break;
    case "error":
      handlers.onError?.(payload as ErrorEvent);
      break;
    default:
      break;
  }
}

async function streamSSE(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${HARNESS_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body ?? {}),
      signal,
    });
  } catch (err) {
    handlers.onTransportError?.(
      err instanceof Error ? err : new Error("network error"),
    );
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onTransportError?.(
      new Error(`stream failed (${res.status} ${res.statusText})`),
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line. Handle \n\n and \r\n\r\n.
      let sep: number;
      while (
        (sep = (() => {
          const a = buffer.indexOf("\n\n");
          const b = buffer.indexOf("\r\n\r\n");
          if (a === -1) return b;
          if (b === -1) return a;
          return Math.min(a, b);
        })()) !== -1
      ) {
        const sepLen = buffer.startsWith("\r\n\r\n", sep) ? 4 : 2;
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + sepLen);
        const frame = parseFrame(raw);
        if (frame) dispatch(frame, handlers);
      }
    }
    // Flush any trailing frame without a final blank line.
    const tail = parseFrame(buffer);
    if (tail) dispatch(tail, handlers);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    handlers.onTransportError?.(
      err instanceof Error ? err : new Error("stream read error"),
    );
  }
}

/** POST /api/chat — streams the assistant turn. */
export async function streamChat(
  args: { message: string; threadId?: string },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const { MOCK, mockChat } = await import("./mock");
  if (MOCK) return mockChat(args.message, handlers);
  return streamSSE(
    "/api/chat",
    { message: args.message, threadId: args.threadId },
    handlers,
    signal,
  );
}

/** POST /api/brief/generate — streams a fresh brief, ends with a canvas event. */
export async function streamBriefGenerate(
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const { MOCK, mockBriefGenerate } = await import("./mock");
  if (MOCK) return mockBriefGenerate(handlers);
  return streamSSE("/api/brief/generate", {}, handlers, signal);
}
