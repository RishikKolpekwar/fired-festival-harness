# s01o — demo video narration script

Voiceover script for `SoloDemo` (Remotion, 1920×1080, 30fps, ~4:28).
Each scene's on-screen caption mirrors this text. Pacing is tuned to ~150 wpm so
the VO lands inside each scene. Record over the rendered `out/solo-demo.mp4`.

The right-hand **rubric rail** ticks each requirement off as its scene covers it;
by the close all 10 are checked.

---

## 1 · Cold open  (0:00–0:14)
> This is Solo. One harness, one worker, four pillars. My 24-hour build for the Gauntlet AI challenge.

## 2 · The idea  (0:14–0:37) — ticks MUST #5
> Solo is a personal intelligence harness. It reads my world — news, RSS, job boards, my inbox and calendar — pulls it live, ranks it, and writes my morning brief in my own voice. Everything you'll see runs on my real data.

## 3 · Architecture  (0:37–1:07) — ticks MUST #1
> Here's the shape. The worker — a Claude Agent SDK agent — only reasons and asks for tools. Four named modules wrap it: material handling, guardrails, checkpoints, and alarms, all inside a bounded loop with hard turn, time, and cost limits. They're separate, identifiable components. Swap the worker and the pillars never move.

## 4 · Material handling  (1:07–1:31) — reinforces MUST #1
> Pillar two: material handling. Every tool is the same contract — a schema, an executor, and a result contract. Exa news, RSS, jobs, iMessage, Gmail and calendar all normalize into one Signal type, scored zero to one and deduped. A failing source comes back as an error in data, it never crashes the run.

## 5 · Guardrails  (1:31–2:03) — ticks MUST #3, contributes to MUST #2
> Pillar three: guardrails, and they're declared, not implicit. Every rule is a named constant — relevance threshold, dedup window, token cap, a tool allow-list, no send without approval, the hallucination fence. Three layers: input, action, output. Watch the behavior change: an item scored 0.31 is dropped before the worker sees it. A send with no approval token is hard-blocked. The agent bends to the rule.

## 6 · Checkpoints  (2:03–2:33) — ticks SHOULD #8 and MUST #2
> The brief pipeline is a chain of checkpoints, each with explicit pass-fail criteria. Here one fails — the hallucination fence catches an uncited entity. The agent reacts: it strips the unsourced claim and re-runs only that stage. And because every checkpoint persists to SQLite, I can replay a run from any checkpoint forward without re-running the stages before it.

## 7 · Alarms  (2:33–2:56) — ticks MUST #4
> Alarms are structured output, never a log line. Each one is a typed object: type, severity, context, and a recommended action that's declared per alarm type. Eight named types — guardrail violation, hallucination detected, stale contact, cost ceiling hit, and more — all persisted and streamed to the UI.

## 8 · Human in the loop  (2:56–3:18) — ticks SHOULD #9
> The harness stops and asks instead of guessing. Every outbound draft pauses at a review gate — approve, edit, or reject. High and critical alarms halt the run until I acknowledge them. Nothing sends on its own.

## 9 · Swappable worker  (3:18–3:45) — ticks SHOULD #7 and BONUS #10
> A worker is just an Agent: run, in, AgentOutput, out. That's the whole contract. I can swap Sonnet 4.6 for Opus 4.8, or drop in a dependency-free heuristic worker with no LLM and no auth. Every call still flows through the same guardrails, checkpoints, and alarms. Zero harness changes — a second worker, proven live.

## 10 · Real demo payoff  (3:45–4:11) — ticks MUST #6 (reinforces #5)
> And here's the payoff: my actual brief from this morning, rendered live. Roche's pathai deal, the Agent SDK billing split, a draft to a ChipAgents founder — real input, real output, tuned to my work. The whole architecture is written up in HARNESS.md in the repo.

## 11 · Close  (4:11–4:28)
> Ten rubric points, four pillars, one swappable worker — built in 24 hours. That's Solo.

---

### Rubric → scene map (for graders)
| # | Tier | Requirement | Scene |
|---|------|-------------|-------|
| 1 | MUST | Four pillars, separate from the worker | 3 Architecture |
| 2 | MUST | Agent behavior changes on feedback | 5 Guardrails + 6 Checkpoints |
| 3 | MUST | Guardrails declared · checkpoints pass/fail | 5 Guardrails |
| 4 | MUST | Alarms are structured output | 7 Alarms |
| 5 | MUST | Runs on a real input (my brief) | 2 The idea + 10 Payoff |
| 6 | MUST | HARNESS.md documents architecture | 10 Payoff |
| 7 | SHOULD | Swappable agent interface | 9 Swap |
| 8 | SHOULD | Checkpoints persisted · replayable | 6 Checkpoints |
| 9 | SHOULD | Human-in-the-loop escalation | 8 Human |
| 10 | BONUS | Second worker swapped in live | 9 Swap |
