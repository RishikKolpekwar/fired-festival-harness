# Solo — Personal Intelligence Harness
**Rishik Kolpekwar · June 12, 2026**

---

## The Big Idea

Every morning you open your laptop and get **one page** — everything relevant to your life, ranked, ready in 10 minutes. Not generic news. Not another inbox. A digest that knows you're building a pathology AI company, interning at Intel on multi-agent LLM frameworks, tracking 20VC portfolio companies, and have live conversations happening across Gmail, iMessages, and your calendar right now.

At the bottom of every brief: **who you should reach out to today, and why.** That action queue bridges into Tab 2 — the outbound engine for MedMorphIQ.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOLO HARNESS                             │
│                                                                 │
│  ┌──────────────┐              ┌──────────────────────────────┐ │
│  │  TAB 1       │              │  TAB 2                       │ │
│  │  Morning     │─ action ────▶│  Outbound Engine             │ │
│  │  Brief       │  queue       │  (MedMorphIQ)                │ │
│  └──────────────┘              └──────────────────────────────┘ │
│         │                               │                       │
│         ▼                               ▼                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    HARNESS CORE                         │   │
│  │                                                         │   │
│  │   Loop ──▶ Tools ──▶ Guardrails ──▶ Observability      │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   AGENT INTERFACE                       │   │
│  │     run(materials, guardrails, tools) → AgentOutput     │   │
│  │                                                         │   │
│  │   Morning Brief Agent  ◀──swap──▶  Outbound Agent       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**One harness. Two agents. Swapping agents requires zero changes to the harness.**

---

## Signal Sources

Everything the harness can read from, normalized before the agent ever sees it:

```
┌─────────────────────────────────────────────────────────────────┐
│                        SIGNAL SOURCES                           │
│                                                                 │
│  INBOX                    CALENDAR               SOCIAL         │
│  ┌──────────┐             ┌──────────┐           ┌──────────┐  │
│  │  Gmail   │             │  Google  │           │  Exa X   │  │
│  │  iMsg    │             │ Calendar │           │  Search  │  │
│  └──────────┘             └──────────┘           └──────────┘  │
│                                                                 │
│  NEWS & CONTENT           JOBS                   ENRICHMENT    │
│  ┌──────────┐             ┌──────────┐           ┌──────────┐  │
│  │  Exa     │             │ InternList│          │  People  │  │
│  │  Tavily  │             │ GitHub   │           │  Data    │  │
│  │  20VC RSS│             │  Boards  │           │  Labs    │  │
│  │ Substack │             │Handshake │           │ Hunter.io│  │
│  └──────────┘             │Exa Career│           └──────────┘  │
│                           └──────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    normalize to Signal type
                    score relevance (0.0–1.0)
                    dedup (48h window)
                              │
                              ▼
                       Agent sees this
```

---

## How a Morning Run Works

```
7:00 AM ─── APScheduler fires
               │
               ▼
        ┌─────────────┐
        │ FETCH STAGE │  Pull from all sources in parallel
        │             │  Alarm if < 3/8 sources return data
        └──────┬──────┘
               │
               ▼
        ┌─────────────┐
        │ SCORE STAGE │  Claude scores each item 0.0–1.0
        │             │  against your profile
        │             │  Drop anything below 0.4
        └──────┬──────┘
               │
               ▼
        ┌─────────────┐
        │  CALENDAR   │  Read next 48h of events
        │  CONTEXT    │  Surface prep for today's meetings
        │             │  Adjust brief length to schedule density
        └──────┬──────┘
               │
               ▼
        ┌─────────────┐
        │   GENERATE  │  Claude writes the brief
        │             │  Every named person/company
        │             │  must cite a source from this run
        └──────┬──────┘
               │
               ▼
        ┌─────────────┐
        │   ACTIONS   │  Extract: who to email today + why
        │             │  Jobs that match your profile
        │             │  Follow-ups overdue from your inbox
        └──────┬──────┘
               │
               ▼
        ┌─────────────┐
        │   DELIVER   │  Render to Tab 1 UI
        │             │  Persist full run to SQLite
        │             │  Emit OTel trace spans
        └─────────────┘
```

Each stage **checkpoints to SQLite** before moving on. If something breaks mid-run, it replays from the last checkpoint — not from scratch.

---

## The Four Pillars

### Pillar 1 — The Agent Loop

The harness drives the agent. The agent never calls the model directly.

```python
def run(user_input, max_turns=8):
    messages = [{"role": "user", "content": user_input}]
    for _ in range(max_turns):
        reply = client.chat(messages, tools=TOOLS)
        messages.append(reply)
        if not reply.tool_calls:        # done
            return reply.text
        for call in reply.tool_calls:
            messages.append(dispatch(call))   # guardrails live here
    raise RuntimeError("turn limit reached")  # alarm fires
```

**Hard limits the agent cannot override:**
- `MAX_TURNS = 8` — can't think forever
- `TOKEN_BUDGET = 32k` — can't blow the context window
- `WALL_CLOCK_TIMEOUT = 120s` — can't hang the morning

---

### Pillar 2 — Tools

Every data source and action is a typed tool. The agent reads the schema, decides when to call it, and always gets back a predictable response — errors are data, not crashes.

```
Tool = Schema (what it does) + Executor (real code) + Result Contract (always {ok, data, error})
```

**Morning Brief Agent tools:**

| Tool | Does | Guardrail |
|---|---|---|
| `search_news` | Exa + Tavily queries | result capped at 2000 tokens |
| `fetch_rss` | 20VC + Substack feeds | domain allow-list only |
| `read_gmail` | Last 24h unread/starred | read-only |
| `read_imessage` | Last 24h messages | read-only, contact allow-list |
| `read_calendar` | Next 48h events | read-only |
| `search_jobs` | InternList, GitHub boards, Handshake, Exa career search | filtered to relevant roles |
| `score_relevance` | Scores items against your profile | no outbound calls |
| `enrich_contact` | People Data Labs + Hunter.io | 10 lookups/run max |

**Outbound Agent tools:**

| Tool | Does | Guardrail |
|---|---|---|
| `lookup_contact` | People Data Labs enrichment | read-only |
| `draft_email` | Writes email in your voice | draft-only |
| `queue_for_review` | Adds draft to review queue | never auto-sends |
| `send_email` | Sends via Gmail | **requires human approval token — hard block without it** |
| `suggest_calendar_block` | Proposes meeting slot | suggest only, no auto-create |

---

### Pillar 3 — Guardrails

Three layers. Declared as named constants in `guardrails.py`. Not baked into prompts.

```
Request comes in
      │
      ▼
┌─────────────────────────────────────┐
│         INPUT GUARDRAILS            │
│  • Drop items below RELEVANCE = 0.4 │
│  • Dedup within 48h window          │
│  • Cap context at 24k tokens        │
│  • Only allow-listed RSS domains    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│       LOOP + TOOLS RUN HERE         │
│  Agent reasons, calls tools         │
└─────────────────┬───────────────────┘
                  │ (every tool call goes through dispatch())
                  ▼
┌─────────────────────────────────────┐
│         ACTION GUARDRAILS           │
│  • Tool must be on allow-list       │
│  • send_email blocked w/o token     │
│  • Max 10 enrichment lookups/run    │
│  • read_ tools are read-only only   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         OUTPUT GUARDRAILS           │
│  • Named person/co needs citation   │
│  • AgentOutput schema validated     │
│  • Drafts below 0.6 confidence      │
│    get flagged for human review     │
└─────────────────────────────────────┘
```

---

### Pillar 4 — Observability

Every model call and tool dispatch emits a structured trace span. Four signals tracked per run. Traces go to **Langfuse** (free tier).

```
p95 latency   $/run cost   err% rate   eval pass rate
     │              │            │             │
     └──────────────┴────────────┴─────────────┘
                          │
                   Langfuse dashboard
                   (replay any run, score output quality)
```

**Structured alarms** — every alarm has: type, severity, context, recommended action.

| Alarm | Severity | When | Action |
|---|---|---|---|
| `SOURCE_DEGRADED` | medium | a fetch source fails | check API key |
| `LOW_SIGNAL` | low | relevance scores all low | broaden query |
| `HALLUCINATION_DETECTED` | high | named entity without citation | strip + re-run |
| `STALE_CONTACT` | medium | no touch in >14 days | surface in outbound |
| `APPROVAL_PENDING` | low | draft unreviewed >24h | ping user |
| `GUARDRAIL_VIOLATION` | critical | send attempted without approval | hard block + log |
| `TURN_LIMIT_REACHED` | high | agent hit MAX_TURNS | escalate to human |
| `COST_CEILING_HIT` | high | run exceeds $0.50 | pause + alert |

---

## Human-in-the-Loop

Three places the harness stops and asks instead of guessing:

```
1. REVIEW GATE ──── All outbound drafts queue here.
                    Approve / Edit / Reject before anything sends.

2. YELLOW FLAG ──── Brief items scored 0.40–0.55.
                    "We think this is relevant — verify."

3. ALARM TRIAGE ─── HIGH + CRITICAL alarms pause the run.
                    Needs acknowledgment before it continues.
```

---

## Calendar Intelligence

The calendar read happens before brief generation and shapes the entire output:

- **Meeting prep** — if you have a call with someone today, their recent news/context surfaces at the top of your brief
- **Schedule-aware length** — packed day → shorter brief, more aggressive filtering
- **Action-to-calendar** — follow-up tasks from the brief get suggested as calendar blocks based on your actual availability
- **Outbound timing** — when the outbound agent drafts an email, it can suggest a meeting slot pulled from your real calendar

---

## Tech Stack

```
┌──────────────────────────────────────────────────────┐
│  FRONTEND     Next.js + Tailwind  (two-tab UI)        │
├──────────────────────────────────────────────────────┤
│  BACKEND      Python + FastAPI                        │
├──────────────────────────────────────────────────────┤
│  LLM          Claude Sonnet 4.6  (Anthropic API)      │
├──────────────────────────────────────────────────────┤
│  TRACING      OpenTelemetry → Langfuse                │
├──────────────────────────────────────────────────────┤
│  STORAGE      SQLite  (checkpoints, contacts, runs)   │
├──────────────────────────────────────────────────────┤
│  SCHEDULER    APScheduler  (7AM daily trigger)        │
├──────────────────────────────────────────────────────┤
│  SEARCH       Exa (semantic)  +  Tavily (real-time)   │
├──────────────────────────────────────────────────────┤
│  INBOX        Gmail MCP  +  iMessage local chat.db    │
├──────────────────────────────────────────────────────┤
│  CALENDAR     Google Calendar MCP                     │
├──────────────────────────────────────────────────────┤
│  RSS          20VC  +  Substack (curated list)        │
├──────────────────────────────────────────────────────┤
│  JOBS         InternList, GitHub boards, Handshake,   │
│               Exa career page search                  │
├──────────────────────────────────────────────────────┤
│  ENRICHMENT   People Data Labs  +  Hunter.io          │
├──────────────────────────────────────────────────────┤
│  LINKEDIN     Signado  (intent signals, free tier)    │
└──────────────────────────────────────────────────────┘
```

---

## Open TODOs Before Build

- [ ] Substack follow list from user
- [ ] X accounts / topics to track
- [ ] Specific GitHub job board repos to scrape
- [ ] Confirm Handshake access active
- [ ] API keys: Exa, Tavily, People Data Labs, Hunter.io, Anthropic
