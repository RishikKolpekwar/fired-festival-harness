// REST client for the Solo Harness backend (see API_CONTRACT.md).
// SSE (chat + brief generation) lives in sse.ts.

import type {
  Alarm,
  Brief,
  BriefTodo,
  FollowUpItem,
  Health,
  Message,
  Thread,
} from "./types";
import {
  MOCK,
  mockAlarms,
  mockBrief,
  mockFollowUps,
  mockHealth,
  mockThread,
  mockThreads,
} from "./mock";

export const HARNESS_URL =
  process.env.NEXT_PUBLIC_HARNESS_URL ?? "http://localhost:8787";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${HARNESS_URL}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new ApiError(`GET ${path} failed`, res.status);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${HARNESS_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new ApiError(`POST ${path} failed`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  health: (signal?: AbortSignal) =>
    MOCK ? Promise.resolve(mockHealth) : get<Health>("/api/health", signal),

  listThreads: (signal?: AbortSignal) =>
    MOCK
      ? Promise.resolve({ threads: mockThreads })
      : get<{ threads: Thread[] }>("/api/threads", signal),

  getThread: (id: string, signal?: AbortSignal) =>
    MOCK
      ? Promise.resolve(mockThread(id))
      : get<{ id: string; title: string; messages: Message[] }>(
          `/api/threads/${id}`,
          signal,
        ),

  latestBrief: (signal?: AbortSignal) =>
    MOCK
      ? Promise.resolve({ brief: mockBrief })
      : get<{ brief: Brief | null }>("/api/brief/latest", signal),

  // Cross-source follow-up command board.
  listFollowUps: (signal?: AbortSignal) =>
    MOCK
      ? Promise.resolve({ items: mockFollowUps })
      : get<{ items: FollowUpItem[]; generatedAt?: string }>(
          "/api/followups",
          signal,
        ),

  listAlarms: (limit = 20, signal?: AbortSignal) =>
    MOCK
      ? Promise.resolve({ alarms: mockAlarms })
      : get<{ alarms: Alarm[] }>(`/api/alarms?limit=${limit}`, signal),

  // Approve a chat-queued draft (has an outbox id). Backend owns the guardrail.
  approveDraft: (id: string) =>
    MOCK
      ? Promise.resolve({ ok: true })
      : post<{ ok: boolean }>(`/api/drafts/${id}/approve`),

  // Execute an approved brief action (email → send, follow_up → text, job → open link).
  executeAction: (a: {
    kind: "email" | "job" | "follow_up";
    who?: string;
    org?: string;
    orgDomain?: string;
    group?: string;
    channel?: "email" | "imessage";
    subject?: string;
    body?: string;
    attachOnePager?: boolean;
    url?: string;
  }): Promise<{
    ok: boolean;
    status?: string;
    to?: string;
    open?: string;
    error?: string;
  }> =>
    MOCK
      ? Promise.resolve({
          ok: true,
          status: a.kind === "job" ? "opened" : "drafted",
          open: a.url,
        })
      : post("/api/actions/execute", a),

  // Personal todos / projects.
  listTodos: (status?: "open" | "done", signal?: AbortSignal) =>
    get<{ todos: BriefTodo[] }>(`/api/todos${status ? `?status=${status}` : ""}`, signal),
  addTodo: (t: { title: string; detail?: string; tag?: string }) =>
    post<{ ok: boolean; todo: BriefTodo }>("/api/todos", t),
  completeTodo: (id: string) =>
    post<{ ok: boolean }>(`/api/todos/${id}`, { action: "done" }),
};

export { ApiError };
