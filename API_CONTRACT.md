# Solo Harness — API Contract (shared)

The single source of truth both halves build against. Backend implements it; frontend consumes it. If either side wants to change a shape, change it **here first**.

- **Backend base URL:** `http://localhost:8787`
- **Frontend dev URL:** `http://localhost:3000` (backend enables CORS for this origin)
- **Transport:** REST for reads/commands; **SSE** (`text/event-stream`) for the live chat + brief streams.
- **Auth:** none between frontend↔backend (both local). The backend talks to Claude via your Pro OAuth token server-side.

---

## Core data types (TypeScript)

```ts
// A normalized unit of input the harness pulled from some source.
type Signal = {
  id: string;
  source: "news" | "rss" | "jobs" | "imessage" | "gmail" | "calendar";
  title: string;
  body: string;
  url?: string;
  ts: string;              // ISO
  relevance?: number;      // 0..1, set by the scorer
  meta?: Record<string, unknown>;
};

// One structured alarm. Always has these four fields (challenge requirement).
type Alarm = {
  type: "SOURCE_DEGRADED" | "LOW_SIGNAL" | "HALLUCINATION_DETECTED"
      | "STALE_CONTACT" | "APPROVAL_PENDING" | "GUARDRAIL_VIOLATION"
      | "TURN_LIMIT_REACHED" | "COST_CEILING_HIT";
  severity: "low" | "medium" | "high" | "critical";
  context: string;
  recommendedAction: string;
  ts: string;
};

type ActionItem = {
  id: string;
  kind: "email" | "job" | "follow_up";
  who?: string;            // contact / company
  reason: string;          // why it surfaced
  suggestedChannel?: string;
  draftOpener?: string;    // email/text: ready-to-send body. job: full application kit (cover note + matched bullets + Q&A)
  url?: string;            // job: the apply link. render an "Apply" button for kind:"job"
  sourceSignalIds: string[];
};

type Brief = {
  id: string;
  generatedAt: string;
  topline?: string;           // editor's note — render at the TOP, big. "what matters today"
  // PRIMARY: one flat feed, already ranked most-relevant-first. NO topic sections.
  items: {
    title: string;
    summary: string;          // real 2-3 sentence digest of the content
    whyItMatters: string;     // REQUIRED — render PROMINENTLY. the personal connection ("why you're seeing this")
    url?: string;
    image?: string;           // a real article/photo image URL — render as the item's image (not a site icon)
    score?: number;           // 0..1 importance (already used for ordering)
    sourceTag?: string;       // small optional chip (e.g. "pathology ai") — NOT a section header
    flagged?: boolean;
  }[];
  actions: ActionItem[];      // draftOpener holds a ready-to-send message body
  citedSources: { id: string; title?: string; url?: string; source: string }[]; // footnote links only
};
```

> **Frontend rendering note:** render `topline` (top, big) → then `items` as **one ranked feed** (each card: `image`, `title`, `summary`, and `whyItMatters` shown prominently as the personal hook) → then `actions`. Do **not** group by topic/`sourceTag` (it's just an optional chip). `citedSources` is a small footnote list — never the main render.

```ts

type Thread = { id: string; title: string; updatedAt: string; preview: string };
type Message = { id: string; role: "user" | "assistant"; content: string; ts: string; usedTools?: string[] };
```

---

## SSE event protocol (the important part)

`POST /api/chat` and `POST /api/brief/generate` both return an SSE stream. Event names and `data` payloads:

| `event:` | `data` (JSON) | Frontend should… |
|---|---|---|
| `status` | `{ id, label, tool, state: "start"\|"done"\|"error" }` | render/update an inline status line (e.g. "searching news…"); collapse to "used N tools" on `done` |
| `token` | `{ text }` | append streamed assistant text to the current bubble |
| `checkpoint` | `{ stage, status: "pass"\|"fail" }` | optional: show pillar progress (nice for demo) |
| `alarm` | `Alarm` | toast / inline alarm chip with severity color |
| `canvas` | `{ kind: "brief"\|"pipeline", payload }` | **open the slide-out canvas** and render payload (`payload` is a `Brief` when kind=brief) |
| `approval` | `{ draftId, channel: "imessage"\|"email", to, body }` | **render an Approve / Edit / Reject card.** Nothing sends until the user approves via `POST /api/drafts/:id/approve`. |
| `done` | `{ threadId, messageId, usedTools: string[], usage: { inputTokens, outputTokens } }` | finalize the bubble; stream ends |
| `error` | `{ message }` | show error state |

SSE framing is standard: `event: <name>\n` then `data: <json>\n\n`.

---

## REST endpoints

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `POST` | `/api/chat` | `{ threadId?: string, message: string }` | **SSE stream** (above). If `threadId` omitted, backend creates one and emits it on `done`. |
| `GET` | `/api/threads` | — | `{ threads: Thread[] }` |
| `GET` | `/api/threads/:id` | — | `{ id, title, messages: Message[] }` |
| `POST` | `/api/brief/generate` | `{}` | **SSE stream**; ends with a `canvas` (kind=brief) + `done` |
| `GET` | `/api/brief/latest` | — | `{ brief: Brief \| null }` |
| `GET` | `/api/alarms` | `?limit=20` | `{ alarms: Alarm[] }` |
| `GET` | `/api/health` | — | `{ ok: true, model: string, lastBriefAt: string \| null, sources: Record<string, "ok"\|"degraded"> }` |
| `GET` | `/api/runs/:id` | — | `{ checkpoints: {stage,status,ts}[], alarms: Alarm[] }` (replay/inspection) |

**Outbound / human-in-the-loop send gate:**
| `GET` | `/api/drafts` | — | `{ drafts: [{id, channel, recipient, recipientName, body, status, createdAt}] }` (pending) |
| `POST` | `/api/drafts` | `{ channel?: "imessage"\|"email", to, body, approve?: boolean }` | `{ ok, draftId, to, status }`. **Use this for the brief's action buttons.** `to` = a contact name/phone/email; backend resolves the iMessage handle. Pass `approve:true` to create **and send** in one call (the button click is the approval). iMessage sends for real; email returns draft-only for now. |
| `POST` | `/api/drafts/:id/approve` | `{}` | `{ ok }` — **performs the actual send** (the only path to the outside world) |
| `POST` | `/api/drafts/:id/reject` | `{}` | `{ ok }` — discards the draft, nothing sends |
| `POST` | `/api/actions/execute` | `{ kind, who?, group?, channel?, subject?, body?, url? }` | **THIS is what a brief Action's button calls** (Approve/Send/Apply). Routes by `kind`: `email` → resolves address + sends via Gmail; `follow_up`/text → iMessage to `who` (or `group`); `job` → `{ ok, status:"open", open: url }` (frontend opens the link, nothing sent). Returns `{ ok, status, to?, open?, error? }`. Do NOT call `/api/drafts/:id/approve` for brief actions — that's only for chat-queued drafts that already have an id. |
| `GET` | `/api/settings` | — | `{ autoSend: boolean }` |
| `POST` | `/api/settings` | `{ autoSend: boolean }` | `{ autoSend }` — when `true`, iMessage drafts send immediately with no approval card (still logged to outbox). |

> **Auto-send:** when `autoSend` is on, the chat agent's `draft_imessage` sends right away and emits a `status` (`sent to …`) instead of an `approval` event — so the frontend won't get an approval card for texts. When off, you get the `approval` event and must `POST /api/drafts/:id/approve`.

**Outbound engine (phase 2, contract reserved):**
| `GET` | `/api/pipeline` | — | `{ contacts: [...] }` |

---

## Conventions

- All timestamps ISO 8601 UTC.
- IDs are short nanoid-style strings.
- The backend never sends an email or mutates the outside world without an explicit approve call. (`NO_SEND_WITHOUT_APPROVAL` guardrail.)
- Frontend should treat `canvas` events as the trigger to open panel B (the slide-out), per the agreed UI model.
