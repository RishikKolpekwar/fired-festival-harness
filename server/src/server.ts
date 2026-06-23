// HTTP/SSE server — thin mapping from harness events to the API_CONTRACT.
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyReply } from "fastify";
import { config, hasClaudeAuth, hasExa } from "./lib/config.js";
import { hasGoogleAuth } from "./lib/google/auth.js";
import { db } from "./lib/db.js";
import { runChat } from "./lib/harness/loop.js";
import { generateBrief, latestBrief } from "./lib/harness/brief.js";
import { ownedRawFollowUps, rankFollowUps } from "./lib/followups.js";
import { emailFollowUps } from "./lib/gmailFollowups.js";
import { recentAlarms } from "./lib/harness/observability.js";
import { createClaudeWorker } from "./lib/agents/claudeAgent.js";
import { createEchoWorker } from "./lib/agents/echoAgent.js";
import { approveAndSend, rejectDraft, pendingOutbox, createDraft, executeAction } from "./lib/tools/messaging.js";
import { autoSendEnabled, setAutoSend } from "./lib/settings.js";
import { addContact, listContacts, setContactStatus } from "./lib/pipeline.js";
import { addTodo, listTodos, completeTodo, reopenTodo, removeTodo } from "./lib/todos.js";
import type { Agent, EmitFn, HarnessEvent } from "./lib/harness/types.js";

function pickWorker(name?: string): Agent {
  return name === "echo" ? createEchoWorker() : createClaudeWorker();
}

// Map an internal HarnessEvent to a contract SSE frame.
function sseFrame(ev: HarnessEvent): string {
  const map: Record<HarnessEvent["kind"], (e: any) => [string, unknown]> = {
    status: (e) => ["status", { id: e.id, label: e.label, tool: e.tool, state: e.state }],
    token: (e) => ["token", { text: e.text }],
    checkpoint: (e) => ["checkpoint", { stage: e.stage, status: e.status }],
    alarm: (e) => ["alarm", e.alarm],
    canvas: (e) => ["canvas", { kind: e.canvasKind, payload: e.payload }],
    approval: (e) => ["approval", { draftId: e.draftId, channel: e.channel, to: e.to, body: e.body }],
    done: (e) => ["done", { threadId: e.threadId, messageId: e.messageId, usedTools: e.usedTools, usage: e.usage }],
    error: (e) => ["error", { message: e.message }],
  };
  const [name, data] = map[ev.kind](ev);
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function startSse(reply: FastifyReply): EmitFn {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": config.frontendOrigin,
  });
  return (ev: HarnessEvent) => reply.raw.write(sseFrame(ev));
}

export async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: config.frontendOrigin });

  // ── POST /api/chat (SSE) ───────────────────────────────────────────────────
  app.post<{ Body: { threadId?: string; message: string }; Querystring: { worker?: string } }>(
    "/api/chat",
    async (req, reply) => {
      const { threadId, message } = req.body ?? {};
      if (!message) return reply.code(400).send({ error: "message required" });
      const emit = startSse(reply);
      try {
        await runChat({ threadId, message, emit, worker: pickWorker(req.query.worker) });
      } catch (err) {
        emit({ kind: "error", message: String(err) });
      } finally {
        reply.raw.end();
      }
    },
  );

  // ── POST /api/brief/generate (SSE) ─────────────────────────────────────────
  app.post<{ Querystring: { worker?: string } }>("/api/brief/generate", async (req, reply) => {
    const emit = startSse(reply);
    try {
      await generateBrief({ emit, worker: pickWorker(req.query.worker) });
    } catch (err) {
      emit({ kind: "error", message: String(err) });
    } finally {
      reply.raw.end();
    }
  });

  // ── GET /api/brief/latest ──────────────────────────────────────────────────
  app.get("/api/brief/latest", async () => ({ brief: latestBrief() }));

  // ── GET /api/followups ─────────────────────────────────────────────────────
  // Ranked follow-ups from real data: outreach pipeline, open todos, latest brief
  // actions (followups.ts), PLUS live Gmail outreach threads (gmailFollowups.ts) so
  // warm leads that live in the inbox surface with their reply state.
  app.get("/api/followups", async () => {
    const raw = [...ownedRawFollowUps(), ...(await emailFollowUps())];
    return { items: rankFollowUps(raw), generatedAt: new Date().toISOString() };
  });

  // ── GET /api/threads ───────────────────────────────────────────────────────
  app.get("/api/threads", async () => {
    const rows = db.prepare(`SELECT id, title, updated_at FROM threads ORDER BY updated_at DESC LIMIT 50`).all() as {
      id: string;
      title: string;
      updated_at: string;
    }[];
    const threads = rows.map((t) => {
      const last = db
        .prepare(`SELECT content FROM messages WHERE thread_id = ? ORDER BY ts DESC LIMIT 1`)
        .get(t.id) as { content: string } | undefined;
      return { id: t.id, title: t.title, updatedAt: t.updated_at, preview: (last?.content ?? "").slice(0, 80) };
    });
    return { threads };
  });

  // ── GET /api/threads/:id ───────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/api/threads/:id", async (req, reply) => {
    const t = db.prepare(`SELECT id, title FROM threads WHERE id = ?`).get(req.params.id) as
      | { id: string; title: string }
      | undefined;
    if (!t) return reply.code(404).send({ error: "not found" });
    const messages = (
      db.prepare(`SELECT id, role, content, used_tools, ts FROM messages WHERE thread_id = ? ORDER BY ts ASC`).all(req.params.id) as {
        id: string;
        role: "user" | "assistant";
        content: string;
        used_tools: string | null;
        ts: string;
      }[]
    ).map((m) => ({ id: m.id, role: m.role, content: m.content, ts: m.ts, usedTools: m.used_tools ? JSON.parse(m.used_tools) : [] }));
    return { id: t.id, title: t.title, messages };
  });

  // ── Outbound: the human-in-the-loop send gate ─────────────────────────────
  // GET pending drafts
  app.get("/api/drafts", async () => ({ drafts: pendingOutbox() }));

  // POST create a draft from a brief action (or chat). Pass approve:true to
  // create AND send in one call (the click in the UI is the human approval).
  app.post<{ Body: { channel?: "imessage" | "email"; to: string; body: string; approve?: boolean } }>(
    "/api/drafts",
    async (req, reply) => {
      const { channel = "imessage", to, body, approve } = req.body ?? ({} as never);
      if (!to || !body) return reply.code(400).send({ ok: false, error: "to and body are required" });
      const created = createDraft({ channel, to, body });
      if (!created.ok) return reply.code(400).send(created);
      if (approve) {
        const sent = await approveAndSend(created.draftId!);
        if (!sent.ok) return reply.code(400).send({ ok: false, draftId: created.draftId, to: created.to, error: sent.error });
        return { ok: true, draftId: created.draftId, to: created.to, status: "sent" };
      }
      return { ok: true, draftId: created.draftId, to: created.to, status: "pending" };
    },
  );

  // POST approve → performs the actual send (the only path to the outside world)
  app.post<{ Params: { id: string } }>("/api/drafts/:id/approve", async (req, reply) => {
    const res = await approveAndSend(req.params.id);
    if (!res.ok) return reply.code(400).send({ ok: false, error: res.error });
    return { ok: true };
  });

  // POST reject → discard the draft, nothing sends
  app.post<{ Params: { id: string } }>("/api/drafts/:id/reject", async (req, reply) => {
    const ok = rejectDraft(req.params.id);
    if (!ok) return reply.code(404).send({ ok: false, error: "no pending draft with that id" });
    return { ok: true };
  });

  // POST execute an APPROVED brief action (the action's Approve / Send / Apply button)
  app.post<{ Body: { kind?: "email" | "job" | "follow_up"; who?: string; group?: string; channel?: "email" | "imessage"; subject?: string; body?: string; url?: string } }>(
    "/api/actions/execute",
    async (req, reply) => {
      const res = await executeAction(req.body ?? {});
      if (!res.ok) return reply.code(400).send(res);
      return res;
    },
  );

  // ── GET /api/alarms ────────────────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string } }>("/api/alarms", async (req) => ({
    alarms: recentAlarms(Number(req.query.limit ?? "20")),
  }));

  // ── GET /api/runs/:id (replay/inspection) ──────────────────────────────────
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req) => {
    const checkpoints = db.prepare(`SELECT stage, status, ts FROM checkpoints WHERE run_id = ?`).all(req.params.id);
    const alarms = db
      .prepare(`SELECT type, severity, context, recommended_action AS recommendedAction, ts FROM alarms WHERE run_id = ?`)
      .all(req.params.id);
    return { checkpoints, alarms };
  });

  // ── Outreach pipeline ──────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string } }>("/api/pipeline", async (req) => ({ contacts: listContacts(req.query.status) }));
  app.post<{ Body: { name: string; link?: string; org?: string; category?: string; note?: string } }>("/api/pipeline", async (req, reply) => {
    if (!req.body?.name) return reply.code(400).send({ ok: false, error: "name required" });
    return { ok: true, contact: addContact(req.body) };
  });
  app.post<{ Params: { id: string }; Body: { status: string } }>("/api/pipeline/:id", async (req, reply) => {
    const ok = setContactStatus(req.params.id, req.body?.status ?? "contacted");
    if (!ok) return reply.code(404).send({ ok: false, error: "contact not found" });
    return { ok: true };
  });

  // ── Todos (personal tasks / projects) ──────────────────────────────────────
  app.get<{ Querystring: { status?: "open" | "done" } }>("/api/todos", async (req) => ({ todos: listTodos(req.query.status) }));
  app.post<{ Body: { title: string; detail?: string; tag?: string; dueDate?: string } }>("/api/todos", async (req, reply) => {
    if (!req.body?.title) return reply.code(400).send({ ok: false, error: "title required" });
    return { ok: true, todo: addTodo(req.body) };
  });
  app.post<{ Params: { id: string }; Body: { action?: "done" | "reopen" } }>("/api/todos/:id", async (req, reply) => {
    const ok = req.body?.action === "reopen" ? reopenTodo(req.params.id) : completeTodo(req.params.id);
    if (!ok) return reply.code(404).send({ ok: false, error: "todo not found" });
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/todos/:id", async (req, reply) => {
    if (!removeTodo(req.params.id)) return reply.code(404).send({ ok: false, error: "todo not found" });
    return { ok: true };
  });

  // ── Settings (auto-send toggle) ────────────────────────────────────────────
  app.get("/api/settings", async () => ({ autoSend: autoSendEnabled() }));
  app.post<{ Body: { autoSend?: boolean } }>("/api/settings", async (req) => {
    if (typeof req.body?.autoSend === "boolean") setAutoSend(req.body.autoSend);
    return { autoSend: autoSendEnabled() };
  });

  // ── GET /api/health ────────────────────────────────────────────────────────
  app.get("/api/health", async () => {
    const lastBrief = db.prepare(`SELECT generated_at FROM briefs ORDER BY generated_at DESC LIMIT 1`).get() as
      | { generated_at: string }
      | undefined;
    const google = hasGoogleAuth() ? "ok" : "degraded";
    return {
      ok: true,
      model: config.model,
      auth: hasClaudeAuth() ? "ok" : "missing (run: claude setup-token)",
      lastBriefAt: lastBrief?.generated_at ?? null,
      sources: {
        news: hasExa() ? "ok" : "degraded",
        rss: "ok",
        jobs: "ok",
        imessage: "ok",
        gmail: google,
        calendar: google,
      },
    };
  });

  return app;
}
