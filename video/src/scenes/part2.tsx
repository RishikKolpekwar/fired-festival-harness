import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT, SEVERITY } from "../theme";
import { SCENES } from "../timeline";
import { RiseHeadline } from "../primitives";
import { Stage, Kicker, Caption } from "../components/Stage";
import { CodeBlock } from "../components/CodeBlock";

// ── 5 · GUARDRAILS ───────────────────────────────────────────────────────────
const GUARD_CODE = [
  "// PILLAR 3 — declared, not implicit. Every rule is a named constant.",
  "export const GUARDRAILS = {",
  "  RELEVANCE_THRESHOLD: 0.4,        // input: drop weak signals",
  "  DEDUP_WINDOW_HOURS: 48,          // input: no repeats within window",
  "  MAX_INPUT_TOKENS: 24_000,        // input: truncate context",
  "  NO_SEND_WITHOUT_APPROVAL: true,  // action: hard block on send",
  "  MAX_ENRICHMENT_PER_RUN: 10,      // action: rate-limit lookups",
  "  HALLUCINATION_FENCE: true,       // output: every entity sourced",
  "  SOURCE_ALLOW_LIST: [ ... ],      // input: only these hosts",
  "  TOOL_ALLOW_LIST:   [ ... ],      // action: only these tools",
  "} as const;",
];

const Layer: React.FC<{ name: string; rules: string; c: string; delay: number }> = ({ name, rules, c, delay }) => {
  const frame = useCurrentFrame();
  const s = spring({ frame: frame - delay, fps: 30, config: { damping: 200 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)`, borderRadius: 13, padding: "14px 18px", background: `${c}10`, border: `1px solid ${c}40`, minWidth: 230 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: c }}>{name}</div>
      <div style={{ fontFamily: FONT.sans, fontSize: 14.5, color: COLORS.muted, marginTop: 6, lineHeight: 1.4 }}>{rules}</div>
    </div>
  );
};

export const Guardrails: React.FC = () => {
  const frame = useCurrentFrame();
  // behavior-change demo cards
  const drop = spring({ frame: frame - 600, fps: 30, config: { damping: 200 } });
  const block = spring({ frame: frame - 680, fps: 30, config: { damping: 200 } });
  return (
    <>
      <Stage dur={SCENES.guardrails} center={false} pad={64}>
        <Kicker delay={2} tag="MUST #3 · #2" tagColor={COLORS.blueSoft}>guardrails are declared</Kicker>
        <div style={{ display: "flex", gap: 34, width: "100%", alignItems: "flex-start" }}>
          <CodeBlock title="server/src/lib/harness/guardrails.ts" lines={GUARD_CODE} startFrame={14} perLine={4} width={760} fontSize={17.5} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <Layer name="input layer" rules="relevance · dedup · token cap · allow-listed hosts" c={COLORS.blueSoft} delay={70} />
            <Layer name="action layer" rules="tool allow-list · no send without approval" c={COLORS.amber} delay={84} />
            <Layer name="output layer" rules="hallucination fence · schema validation" c={COLORS.rose} delay={98} />
          </div>
        </div>

        {/* behavior change: two concrete decisions */}
        <div style={{ display: "flex", gap: 22, marginTop: 6 }}>
          <div style={{ opacity: drop, transform: `scale(${interpolate(drop, [0, 1], [0.92, 1])})`, borderRadius: 13, padding: "14px 20px", background: "rgba(255,107,139,0.08)", border: "1px solid rgba(255,107,139,0.4)", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 14, color: COLORS.muted }}>signal relevance <b style={{ color: COLORS.rose }}>0.31</b></span>
            <span style={{ color: COLORS.faint }}>→</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 14, color: COLORS.rose }}>DROPPED · RELEVANCE_THRESHOLD</span>
          </div>
          <div style={{ opacity: block, transform: `scale(${interpolate(block, [0, 1], [0.92, 1])})`, borderRadius: 13, padding: "14px 20px", background: "rgba(255,107,139,0.08)", border: "1px solid rgba(255,107,139,0.4)", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 14, color: COLORS.muted }}>send_email · no token</span>
            <span style={{ color: COLORS.faint }}>→</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 14, color: COLORS.rose }}>BLOCKED · NO_SEND_WITHOUT_APPROVAL</span>
          </div>
        </div>
      </Stage>
      <Caption text="nothing lives in a prompt. an item scored 0.31 is dropped before the worker sees it. a send with no approval token is hard-blocked. the agent's behavior bends to the rule." delay={600} />
    </>
  );
};

// ── 6 · CHECKPOINTS ──────────────────────────────────────────────────────────
const STAGES = [
  { s: "SOURCE_FETCH", ok: true },
  { s: "RELEVANCE_SCORE", ok: true },
  { s: "CALENDAR_CONTEXT", ok: true },
  { s: "BRIEF_GENERATION", ok: false }, // fails on hallucination fence
  { s: "ACTION_EXTRACT", ok: true },
  { s: "DELIVER", ok: true },
];

export const Checkpoints: React.FC = () => {
  const frame = useCurrentFrame();
  const failIdx = 3;
  // the failing stage flips to pass after the agent strips the uncited entity
  const reacted = frame > 560;
  const replay = spring({ frame: frame - 640, fps: 30, config: { damping: 200 } });
  return (
    <>
      <Stage dur={SCENES.checkpoints} pad={64}>
        <Kicker delay={2} tag="SHOULD #8 · MUST #2" tagColor={COLORS.amber}>checkpoints · pass/fail · replayable</Kicker>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {STAGES.map((st, i) => {
            const appear = spring({ frame: frame - 26 - i * 14, fps: 30, config: { damping: 200 } });
            const isFail = i === failIdx && !reacted;
            const c = isFail ? COLORS.rose : COLORS.green;
            return (
              <React.Fragment key={st.s}>
                <div style={{ opacity: appear, transform: `translateY(${interpolate(appear, [0, 1], [14, 0])}px)`, borderRadius: 12, padding: "12px 14px", minWidth: 150, background: `${c}12`, border: `1.5px solid ${c}${isFail ? "" : "66"}`, textAlign: "center", boxShadow: isFail ? `0 0 30px -8px ${c}` : "none" }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: 12.5, color: "#fff", letterSpacing: "0.02em" }}>{st.s}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 12, color: c, marginTop: 5 }}>
                    {isFail ? "✕ fail" : "✓ pass"}
                  </div>
                </div>
                {i < STAGES.length - 1 && <span style={{ color: COLORS.faint, opacity: appear }}>→</span>}
              </React.Fragment>
            );
          })}
        </div>

        {/* reaction + replay */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22, alignItems: "center" }}>
          <div style={{ opacity: interpolate(frame, [480, 510], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), fontFamily: FONT.mono, fontSize: 16, color: COLORS.rose }}>
            BRIEF_GENERATION failed → HALLUCINATION_FENCE flagged an uncited entity
          </div>
          <div style={{ opacity: interpolate(frame, [540, 570], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), fontFamily: FONT.mono, fontSize: 16, color: COLORS.green }}>
            agent strips the unsourced claim → re-runs that stage only → ✓ pass
          </div>
          <div style={{ opacity: replay, transform: `scale(${interpolate(replay, [0, 1], [0.94, 1])})`, marginTop: 6, fontFamily: FONT.mono, fontSize: 15, color: COLORS.blueSoft, padding: "12px 20px", borderRadius: 12, border: `1px solid ${COLORS.blue}55`, background: "rgba(20,136,252,0.08)" }}>
            replay(runId, "BRIEF_GENERATION") · loads SQLite payload · stages 1–3 are NOT re-run
          </div>
        </div>
      </Stage>
      <Caption text="the brief pipeline is a chain of checkpoints with explicit pass/fail. one fails the hallucination fence, the agent strips the uncited entity and re-runs only that stage. each checkpoint is persisted, so a run replays from any point forward." delay={480} />
    </>
  );
};

// ── 7 · ALARMS ───────────────────────────────────────────────────────────────
const ALARM_OBJ = [
  "{",
  '  type: "GUARDRAIL_VIOLATION",',
  '  severity: "critical",',
  '  context: "Send attempted via send_email without human approval.",',
  '  recommendedAction: "Route through the review queue; approve before sending.",',
  '  ts: "2026-06-13T20:36:46Z",',
  "}",
];
const TYPES = [
  { t: "HALLUCINATION_DETECTED", sev: "high" },
  { t: "STALE_CONTACT", sev: "medium" },
  { t: "COST_CEILING_HIT", sev: "high" },
  { t: "TURN_LIMIT_REACHED", sev: "high" },
];

export const Alarms: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <Stage dur={SCENES.alarms} center={false} pad={72}>
        <Kicker delay={2} tag="MUST #4" tagColor={COLORS.rose}>alarms are structured output</Kicker>
        <div style={{ display: "flex", gap: 40, alignItems: "center", width: "100%" }}>
          <CodeBlock title="harness emits an Alarm object" lines={ALARM_OBJ} startFrame={16} perLine={6} width={820} fontSize={19} showLineNumbers={false} highlight={[1, 2]} highlightAt={70} highlightColor={COLORS.rose} />
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.16em", color: COLORS.faint, marginBottom: 2 }}>8 NAMED TYPES</div>
            {TYPES.map((a, i) => {
              const s = spring({ frame: frame - 150 - i * 12, fps: 30, config: { damping: 200 } });
              const c = SEVERITY[a.sev];
              return (
                <div key={i} style={{ opacity: s, transform: `translateX(${interpolate(s, [0, 1], [22, 0])}px)`, display: "flex", alignItems: "center", gap: 10, fontFamily: FONT.mono, fontSize: 14, color: "#fff", padding: "9px 13px", borderRadius: 9, background: `${c}12`, border: `1px solid ${c}44` }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: c, boxShadow: `0 0 8px ${c}` }} />
                  {a.t}
                  <span style={{ marginLeft: "auto", color: c, fontSize: 12 }}>{a.sev}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Stage>
      <Caption text="alarms are never a log line. each is a typed object — type, severity, context, recommendedAction — persisted and streamed to the UI. the recommended action is declared per type, not improvised." delay={150} />
    </>
  );
};
