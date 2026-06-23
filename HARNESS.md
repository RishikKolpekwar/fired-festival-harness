# HARNESS.md — Solo Personal Intelligence Harness

A framework an AI agent lives inside. The agent (a Claude worker) reasons and asks
for tools; the **harness** owns everything that makes it useful and safe —
guardrails, checkpoints, material handling, and alarms — as distinct, swappable
modules. The agent never touches the outside world directly.

> Domain: a chat-first personal intelligence tool for the engineer (UT Austin
> CS/Math, Intel AI SWE intern, founder of MedMorphIQ). You talk to it; it answers
> grounded in your real data (news, RSS, job boards, iMessage, soon Gmail/Calendar)
> and produces a morning brief with an action queue. Runs locally.

---

## Architecture at a glance

```
HTTP / SSE  (server.ts)                 ← maps harness events ⇄ API_CONTRACT.md
      │
      ▼
LOOP  (lib/harness/loop.ts)             ← PILLAR 1: governance
   • bounded: MAX_TURNS, WALL_CLOCK_MS, COST_CEILING_USD
   • wires guardrail-wrapped callTool, picks the worker, escalates alarms
      │
      ├── WORKER  (lib/agents/*.ts)      ← swappable; the "agent"
      │     • claudeAgent.ts  → Claude Agent SDK, Pro-subscription OAuth (no API credits)
      │     • echoAgent.ts    → dependency-free heuristic worker (bonus: portability)
      │
      ├── TOOLS / DISPATCH (lib/harness/tools.ts + lib/tools/*) ← PILLAR 2: material handling
      │     • search_news (Exa) · fetch_rss (20VC/Substack) · search_jobs (GH boards) · read_imessage
      │     • every source normalized to a `Signal`; every call is a typed {schema, executor, result-contract}
      │
      ├── GUARDRAILS (lib/harness/guardrails.ts) ← PILLAR 3: declared, 3 layers
      │     • INPUT  · relevance threshold, dedup window, source allow-list
      │     • ACTION · tool allow-list, NO_SEND_WITHOUT_APPROVAL, enrichment cap
      │     • OUTPUT · hallucination fence (named entity must be sourced this run)
      │
      └── OBSERVABILITY (lib/harness/observability.ts + db.ts) ← PILLAR 4
            • checkpoints (persisted, replayable) · structured alarms · trace spans
```

The brief pipeline (`lib/harness/brief.ts`) is a deterministic, fully-checkpointed
run that exercises all four pillars: fetch → score → calendar-context → generate →
extract-actions → deliver.

---

## The four pillars (each a distinct, identifiable component)

### Pillar 1 — Loop (governance) · `lib/harness/loop.ts`
The harness drives the worker inside hard, **declared** limits the worker cannot
override:
- `MAX_TURNS = 8`, `WALL_CLOCK_MS = 120_000` (AbortController), `COST_CEILING_USD = 0.5`.
- Owns tool-dispatch wiring, persistence (run/thread/message), and alarm escalation
  (`TURN_LIMIT_REACHED`, `COST_CEILING_HIT`).
- The worker only reasons + requests tools — constraint-handling is invisible to it.

### Pillar 2 — Material handling · `lib/harness/tools.ts`, `lib/tools/*`
Clean interfaces in and out. The worker never executes a tool; it asks the harness,
which runs `action-guardrail → execute → persist signals → trace`. Every tool is a
typed contract:
```ts
Tool = { name, description, parameters, effect: "read"|"write"|"send",
         execute(args) -> { ok, data, error, signals? } }
```
All sources normalize to a single `Signal` type before the worker sees them.
**This dispatch is worker-agnostic**, so a swapped-in worker reuses every pillar.

### Pillar 3 — Guardrails (declared, not implicit) · `lib/harness/guardrails.ts`
Named constants in `GUARDRAILS`, evaluated in three layers — nothing lives in a prompt:
| Layer | Rules |
|---|---|
| INPUT | `RELEVANCE_THRESHOLD` (0.4), `DEDUP_WINDOW_HOURS` (48), `SOURCE_ALLOW_LIST`, `MAX_INPUT_TOKENS` |
| ACTION | `TOOL_ALLOW_LIST`, **`NO_SEND_WITHOUT_APPROVAL`** (hard block on `send` tools without an approval token), `MAX_ENRICHMENT_PER_RUN` |
| OUTPUT | `HALLUCINATION_FENCE` — any named person/company in output must appear in a cited source from this run, else flagged |
Each rule returns an explicit pass/fail `GuardrailDecision`; failures can raise an alarm.

The agent's behavior changes based on this feedback: a blocked tool returns an
error-as-data the model reacts to; flagged output is marked; degraded sources are
surfaced — all without crashing the run.

### Pillar 4 — Observability · `lib/harness/observability.ts`, `lib/db.ts`
- **Checkpoints** persist each stage's replayable payload to SQLite
  (`SOURCE_FETCH`, `RELEVANCE_SCORE`, `CALENDAR_CONTEXT`, `BRIEF_GENERATION`,
  `ACTION_EXTRACT`, `DELIVER`, `CHAT_TURN`) with explicit `pass`/`fail` criteria.
  You can replay a run from any checkpoint forward without re-running prior stages.
- **Structured alarms** — every alarm has `type`, `severity`, `context`,
  `recommendedAction`, `ts`. Eight named types (see `observability.ts`).
- **Trace spans** — latency + attributes per model/tool call.

---

## Swappable agent interface (Should)

```ts
interface Agent { id: string; run(input: AgentInput): Promise<AgentOutput>; }
```
`AgentInput` hands the worker a guardrail-wrapped `callTool` and tool *specs* only —
never executors. Dropping in a different worker requires **zero** harness changes:
- `createClaudeWorker()` — Claude Agent SDK, authed by the Pro subscription.
- `createEchoWorker()` — no SDK, no auth; still routed through every pillar.

Demo the bonus by switching `?worker=echo` on `/api/chat` or `npm run brief -- echo`.

## Human-in-the-loop escalation (Should)
- **Review gate:** `send`-effect tools are hard-blocked without an approval token
  (`NO_SEND_WITHOUT_APPROVAL`); the only send path is an explicit approve call.
- **Low-confidence flag:** brief items failing the hallucination fence are marked.
- **Alarm triage:** high/critical alarms (e.g. `GUARDRAIL_VIOLATION`) are persisted
  and streamed for acknowledgment.

## Checkpoint replay (Should)
Checkpoints store their payload (`checkpoints.payload`), and
`Observability.loadCheckpoint(runId, stage)` rehydrates it — a run resumes from a
stage without re-fetching. Inspect any run at `GET /api/runs/:id`.

---

## Running it

```bash
cd server
npm install
claude setup-token          # mint a Pro-subscription OAuth token
#  → paste into server/.env as CLAUDE_CODE_OAUTH_TOKEN
npm run dev                 # http://localhost:8787
npm run brief               # generate a brief on the CLI (Claude worker)
npm run brief -- echo       # ...or the second worker, no auth
```

Real input at demo time: the harness runs on the engineer's own news/RSS/job/iMessage
data and the `profile.md` lens.

## Tech
TypeScript · Fastify (HTTP/SSE) · Claude Agent SDK (worker) · better-sqlite3
(checkpoints/threads/alarms/traces) · Exa + rss-parser + GitHub job boards + local
`chat.db` (material handling) · node-cron (7AM brief). Frontend (separate instance)
consumes `API_CONTRACT.md`.

## Roadmap
Gmail + Calendar tools (Google OAuth) · outbound engine (contacts pipeline, draft
queue, the single approved send path) · relevance-tuning from feedback.
