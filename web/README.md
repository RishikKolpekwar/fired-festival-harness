# Solo Harness — Web

Chat-first frontend for the Solo personal intelligence harness. Built to
`../API_CONTRACT.md`; consumes the backend's REST + SSE.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

The backend (separate track) must be running at `http://localhost:8787` for live
data. Override with `NEXT_PUBLIC_HARNESS_URL` in `.env.local`. With the backend
down, the UI still loads — the health dot reads "harness offline" and chats show
a clear inline error instead of hanging.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind v4 + `tw-animate-css`
- `lucide-react` icons
- shadcn-style structure (`components/ui/`)

## Map

```
app/
  layout.tsx          root layout, dark theme
  page.tsx            orchestrates hero <-> chat view, canvas, history rail
components/
  ui/bolt-style-chat.tsx   landing hero (ray bg, glass input, model selector)
  chat/                    message list/bubble, tool-status, alarm chip,
                           checkpoint bar, composer
  canvas/                  slide-out panel + Brief renderer (model "B")
  history-rail.tsx         collapsible thread history
  health-dot.tsx           harness-running indicator + source statuses
  brief-banner.tsx         "morning brief ready" -> opens canvas
hooks/
  use-harness.ts      all state + SSE/REST orchestration
lib/
  types.ts            mirror of API_CONTRACT core types
  api.ts              REST client
  sse.ts              fetch-based SSE parser (POST streams, not EventSource)
  severity.ts         alarm severity -> color
  utils.ts            cn(), time helpers
```

## How the streaming works

`POST /api/chat` returns `text/event-stream`. Because it's a POST, we can't use
`EventSource` — `lib/sse.ts` reads the response body stream and parses
`event:`/`data:` frames, dispatching to typed handlers:

| event | effect |
|---|---|
| `status` | live tool-status line; collapses to "used N tools" on `done` |
| `token` | appends to the streaming assistant bubble |
| `checkpoint` | pillar-progress chips |
| `alarm` | severity-colored chip (inline + alarms tray) |
| `canvas` | opens the slide-out canvas with the `Brief` |
| `done` | finalizes bubble, captures `threadId`, refreshes history |
| `error` | inline error state |

The only mutation the frontend triggers is `POST /api/drafts/:id/approve`
(approve button in the canvas). All guardrails live in the backend.
