# Frontend Tasks — Solo Harness

You're building the **chat-first UI** for a personal intelligence harness. The backend (a separate TypeScript service) is being built in parallel and exposes everything you need over HTTP/SSE.

**Read `API_CONTRACT.md` first — it is the interface you build against.** Don't invent endpoints; if you need a new shape, add it to the contract so the backend side picks it up.

## The product (agreed design)

- **Chat-first.** App opens to an elegant Bolt-style chat box (dark, glassy, ray-gradient background). The user talks to the harness; it answers grounded in their personal data (email, messages, calendar, news, jobs) which the **backend** fetches via tools.
- **Slide-out canvas (model "B").** Dense artifacts (the morning brief, the outbound pipeline) do **not** render as chat bubbles. When the backend emits a `canvas` SSE event, open a slide-out panel and render it there.
- **Visible tool calls.** As the harness works, the backend streams `status` events (`searching news…`, `reading 3 unread emails…`). Render these as live inline status lines under the user's message, then collapse to "used N tools" when `done`.
- **Persistent threads.** Past conversations are kept (backend `/api/threads`). Default landing is the chat box; a light history rail exposes prior threads without crowding the screen.
- **Proactive brief.** On load, call `/api/brief/latest`. If a fresh brief exists, show a one-line chat message ("morning brief ready — N things need you"); clicking it opens the canvas with the full `Brief`.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn structure (`components/ui/`)
- `lucide-react` for icons
- The pasted **`bolt-style-chat.tsx`** component is the landing hero — adapt it: wire its `onSend` to `POST /api/chat` and consume the SSE stream.

## Build checklist

- [ ] Scaffold Next.js + Tailwind + shadcn (`components/ui`), add `lucide-react`, `tailwindcss-animate`
- [ ] Drop in `bolt-style-chat.tsx` (provided) as the landing screen
- [ ] **Chat stream client:** `POST /api/chat` with `fetch` + read the SSE body; dispatch on event name (`status`/`token`/`alarm`/`canvas`/`done`)
- [ ] **Message list:** user + assistant bubbles; assistant bubble fills from `token` events
- [ ] **Tool-status lines:** render `status` events live; collapse to "used N tools" pill on `done`
- [ ] **Slide-out canvas:** opens on `canvas` event; renders a `Brief` (sections + action items) elegantly; reserve a `pipeline` kind for phase 2
- [ ] **Alarm chips:** render `alarm` events with severity color (low→gray, medium→amber, high→orange, critical→red)
- [ ] **Approval card (chat-queued drafts):** on an `approval` event, render Approve / Edit / Reject. Approve → `POST /api/drafts/:id/approve`; Reject → `POST /api/drafts/:id/reject`.
- [ ] **Brief action buttons:** each `Brief.actions[]` item gets a button (Send for email/text, Apply/Open for job). The button calls **`POST /api/actions/execute`** with the action fields (`kind`, `who`, `body`/`draftOpener`, `url`, optional `group`). **Do NOT call `/api/drafts/:id/approve` here** — brief actions have no draft id, that's why approve was failing with "retry".
- [ ] **History rail:** `GET /api/threads`; click loads `GET /api/threads/:id`
- [ ] **Brief-ready banner:** `GET /api/brief/latest` on load → chat message → opens canvas
- [ ] **Health dot:** `GET /api/health` for a small "harness running" indicator + model name
- [ ] Empty/loading/error states; keyboard send (Enter), Shift+Enter newline (already in the component)

## Integration notes

- Backend runs at `http://localhost:8787`, CORS-enabled for `http://localhost:3000`. Put it in an env var (`NEXT_PUBLIC_HARNESS_URL`).
- SSE: use `fetch()` streaming (not `EventSource`, since chat is a POST). Parse `event:`/`data:` frames yourself or use a tiny SSE parser.
- The `canvas` event's `payload` for `kind:"brief"` is a full `Brief` object — see contract.
- Don't implement any send/approve logic beyond calling `POST /api/drafts/:id/approve`; the backend owns all guardrails.
