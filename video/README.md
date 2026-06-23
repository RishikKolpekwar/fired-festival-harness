# s01o — demo video

A ~4.5 minute Remotion explainer for **Solo**, my Gauntlet AI 24-hour Build
Challenge submission. Built to make a grader's job trivial: a persistent
**rubric rail** on the right ticks off each of the 10 requirements the moment its
scene covers it. By the close, all 10 are checked.

The look, copy, and code on screen are pulled straight from the real project
(`server/` harness + `web/` UI). The brief content is **my actual morning brief**,
fetched live from the running harness at build time (`GET /api/brief/latest` →
`src/realBrief.ts`) — so the "runs on real input" requirement is shown with real
data, not a mock.

## Render

```bash
npm install
npm run dev        # Remotion Studio — scrub/edit live
npm run render     # -> out/solo-demo.mp4   (1920x1080, 30fps, ~4:28)
npm run still      # single frame -> out/frame.png
```

To refresh the embedded brief from the live harness (server on :8787):

```bash
curl -s http://localhost:8787/api/brief/latest \
  | node -e 'const b=JSON.parse(require("fs").readFileSync(0)).brief; /* see git history for the extractor */'
```

## Scenes → rubric (the scoreboard)

| # | Scene | Rubric ticked |
|---|-------|---------------|
| 1 | Cold open | — |
| 2 | The idea (live UI + real brief) | MUST #5 |
| 3 | Architecture diagram | MUST #1 |
| 4 | Material handling (`tools/`) | MUST #1 |
| 5 | Guardrails (declared constants + behavior change) | MUST #3, #2 |
| 6 | Checkpoints (pass/fail, fail→react, replay) | SHOULD #8, MUST #2 |
| 7 | Alarms (structured object, 8 types) | MUST #4 |
| 8 | Human-in-the-loop (review gate) | SHOULD #9 |
| 9 | Swappable worker (Agent interface + 2nd worker) | SHOULD #7, BONUS #10 |
| 10 | Real demo payoff + HARNESS.md | MUST #6 |
| 11 | Close (10/10 ticked) | — |

Full per-scene narration is in [`SCRIPT.md`](./SCRIPT.md) (record VO over the render).

## Design tokens (from `solo/web`)

- bg `#06070b` · neon blue `#1488fc` · soft blue `#7cc0ff` · teal `#5ee3c0` · lilac `#a9b8ff` · amber `#ffb86b` · rose `#ff6b8b`
- Space Grotesk (display) · Geist Mono (labels/code) · Geist Sans (body)
- aurora blobs + grain, glass panels, conic beam borders, neon `s01o` wordmark

## Source map

```
src/
  Root.tsx              composition registration + font loading
  SoloDemo.tsx          <Series> of 11 scenes + the persistent rubric rail
  timeline.ts           scene durations + rubric tick schedule (single source of truth)
  theme.ts              palette, fonts, layout, syntax colors
  realBrief.ts          my live brief, extracted at build time
  Aurora.tsx            animated aurora backdrop + film grain
  Wordmark.tsx          neon s01o wordmark + sparkle row
  components/
    RubricRail.tsx      the right-rail scoreboard that ticks off 1..10
    CodeBlock.tsx       syntax-highlighted code with a scan reveal
    Diagram.tsx         worker + four-pillar architecture diagram
    Stage.tsx           per-scene frame (edge fades, rail-clearance, caption)
  ui/
    NeonWord.tsx        compact inline wordmark
    ChatMock.tsx        recreated chat home
    BriefMock.tsx       recreated magazine "morning read" (real brief data)
  scenes/
    part1.tsx           ColdOpen · Idea · Architecture · Material
    part2.tsx           Guardrails · Checkpoints · Alarms
    part3.tsx           Human · Swap · Payoff · Close
```
