# Solo

**A personal intelligence harness. One quiet, glassy feed that replaces the morning doomscroll.**

Every morning at 7am, Solo wakes up, sends a fleet of autonomous agents out across your world, and hands back a single flowing brief — the news that actually matters to *you*, the threads waiting in your inbox, the things you said you'd do. Dark, lock-screen calm, no cards to swipe. Just the read.

Then you text it back. From your phone. And it acts.

---

## What it is

Two modules on one always-on harness:

- **Morning brief** — a daily editorial digest, not a firehose. Solo deploys eight domain **scout agents** in parallel — each one decides its own searches, runs its own tools, and writes its own section: pathology AI, AI infra & chip verification, broad tech, VC & accelerators, markets & quant, sports, jobs, and your inbox. The orchestrator dedupes, ranks against a personal relevance lens, and reflows it into one continuous document.
- **Outbound engine** — drafts outreach in your voice, finds the right addresses, attaches the right collateral, and threads conversations. Nothing sends without you.

You talk to it the way you'd text a chief of staff — over **Telegram or iMessage** — and it answers with full conversation memory, schedules things, and queues drafts.

## How it works

```
                 ┌──────────── 7am cron / on-wake catch-up ────────────┐
                 ▼                                                       │
   ┌─────────────────────────┐     ┌──────────────────────────────┐     │
   │  scout fleet (parallel)  │ ──▶ │  orchestrator                 │     │
   │  8 autonomous agents,    │     │  dedupe · rank · reflow        │ ──▶ glassy feed
   │  one per domain          │     │  four-pillar guardrails        │     (Next.js)
   └─────────────────────────┘     └──────────────────────────────┘     │
        │  tools: web · news · rss · jobs · gmail · calendar · drive     │
        ▼                                                                 │
   ┌─────────────────────────┐                                           │
   │  Telegram / iMessage     │ ◀── text it back, it acts ────────────────┘
   └─────────────────────────┘
```

Every brief run is graded against a four-pillar rubric — **guardrails, checkpoints, material-handling, alarms** — so a flaky scout or a dead API never silently ships a half-empty brief. Freshness is calendar-day based with empty-brief retries, so it stays correct even if the machine sleeps through 7am.

## Stack

**Backend** — TypeScript on Fastify, [Anthropic Claude Agent SDK](https://docs.anthropic.com/en/api/agent-sdk) (Sonnet 4.6 for scouts, Opus 4.8 for heavy synthesis), `better-sqlite3` for state, `node-cron` for scheduling, [Exa](https://exa.ai) for neural web search, `rss-parser` for feeds, `google-auth-library` for Gmail/Calendar/Drive, `zod` for tool schemas.

**Frontend** — Next.js + React, Tailwind, `motion`, a `three` / Spline aurora backdrop and `tsparticles`, `react-markdown` for the brief itself — a translucent dark, lock-screen-calm reading surface.

**Bridges** — Telegram bot + native macOS iMessage, both with persistent per-conversation threads.

**Reliability** — process guards that keep the harness alive across stray async aborts, a launchd service for 24/7 uptime, and a proactive Google auth health-check that alerts your phone *before* a token or API failure ever interrupts a run.

## Run it

```bash
# backend
cd server
cp .env.example .env        # add your keys
npm install
npm run google-auth         # one-time OAuth for Gmail/Calendar/Drive
npm run dev                 # harness on http://localhost:8787

# frontend
cd web
npm install
npm run dev                 # feed on http://localhost:3000
```

The brief generates automatically at 7am local; trigger one on demand with `npm run brief`.

---

*Built to make the morning feel less like a feed and more like a front page that knows you.*
