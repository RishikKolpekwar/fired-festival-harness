# Backend Tasks — Solo Harness (my track)

Standalone TypeScript service: the **harness** that governs a Claude worker and exposes the API in `API_CONTRACT.md`. Lives in `server/`. Runs at `http://localhost:8787`.

## Architecture

```
HTTP/SSE server (Fastify)
   └── Harness
        ├── Loop          (pillar 1) bounded turn loop, hard caps
        ├── Tools         (pillar 2) material handling: exa, rss, jobs, imessage, (gmail/cal later)
        ├── Guardrails    (pillar 3) declared, 3 layers: input / action / output
        ├── Observability (pillar 4) checkpoints (SQLite) + structured alarms + traces
        └── Worker        Claude Agent SDK, authed via Pro OAuth token  ← swappable
```

The Claude Agent SDK is the **worker**; the four pillars wrap it and are separate, identifiable modules (challenge requirement).

## Checklist

- [x] Repo split docs (API_CONTRACT / FRONTEND_TASKS / BACKEND_TASKS)
- [ ] Scaffold `server/`: package.json, tsconfig, tsx dev runner, deps (claude-agent-sdk, fastify, better-sqlite3, exa-js, rss-parser, zod, nanoid)
- [ ] `lib/harness/types.ts` — Signal, Alarm, Brief, AgentOutput, GuardrailSet, ToolResult
- [ ] **Pillar 2 — tools/** material handling, each `{schema, executor, resultContract}` → normalizes to `Signal`:
  - [ ] `news.ts` (Exa)            [ ] `rss.ts` (20VC + Substack)
  - [ ] `jobs.ts` (GitHub boards)  [ ] `imessage.ts` (local chat.db, read-only)
- [ ] **Pillar 3 — guardrails.ts** declared constants; input/action/output layers; `NO_SEND_WITHOUT_APPROVAL`, relevance threshold, dedup, hallucination fence, tool allow-list
- [ ] **Pillar 4 — observability.ts** checkpoint persistence (replayable), structured alarms (type/severity/context/action), trace spans; `db.ts` SQLite schema
- [ ] **Pillar 1 — loop.ts** bounded loop (MAX_TURNS / token budget / wall-clock), calls worker, applies guardrails per tool call, emits events
- [ ] **Worker — agent.ts** Agent SDK wrapper behind a swappable `Agent` interface; subscription auth via `CLAUDE_CODE_OAUTH_TOKEN`
- [ ] **Brief pipeline** fetch → score → calendar-context → generate → extract actions → deliver; each stage a checkpoint
- [ ] **HTTP server** routes from contract; SSE emitter that maps harness events → contract events
- [ ] `profile.md` — who the user is, for relevance scoring (distilled from CLAUDE.md)
- [ ] Subscription auth wiring + `claude setup-token` instructions
- [ ] 7AM scheduler (node-cron) → generate brief → mark "brief ready"
- [ ] `HARNESS.md` — architecture + the four pillars (challenge deliverable)
- [ ] Phase 2: gmail/calendar tools (Google OAuth), outbound engine + pipeline + approve route

## Notes

- Default model `claude-sonnet-4-6` (stretches Pro quota); flip heavy tasks to `claude-opus-4-8`.
- iMessage = read-only `~/Library/Messages/chat.db` via better-sqlite3; macOS-local only.
- Everything persists to one SQLite file so any run is replayable from a checkpoint.
