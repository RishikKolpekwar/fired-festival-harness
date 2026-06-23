import React from "react";
import { useCurrentFrame, interpolate, spring, AbsoluteFill } from "remotion";
import { COLORS, FONT } from "../theme";
import { SCENES } from "../timeline";
import { RiseHeadline } from "../primitives";
import { Stage, Kicker, Caption } from "../components/Stage";
import { CodeBlock } from "../components/CodeBlock";
import { Wordmark, SparkleRow } from "../Wordmark";
import { BriefMock } from "../ui/BriefMock";
import { RUBRIC } from "../timeline";

// ── 8 · HUMAN-IN-THE-LOOP ────────────────────────────────────────────────────
export const Human: React.FC = () => {
  const frame = useCurrentFrame();
  const card = spring({ frame: frame - 24, fps: 30, config: { damping: 200 } });
  const pause = spring({ frame: frame - 220, fps: 30, config: { damping: 200 } });
  const btns = [
    { label: "approve", c: COLORS.green },
    { label: "edit", c: COLORS.blueSoft },
    { label: "reject", c: COLORS.rose },
  ];
  return (
    <>
      <Stage dur={SCENES.human} pad={64}>
        <Kicker delay={2} tag="SHOULD #9" tagColor={COLORS.teal}>human in the loop</Kicker>
        <RiseHeadline text="the harness stops and asks instead of guessing." delay={10} size={40} />

        <div style={{ opacity: card, transform: `translateY(${interpolate(card, [0, 1], [30, 0])}px)`, width: 880, borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(10,12,18,0.7)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.14em", color: COLORS.amber, border: `1px solid ${COLORS.amber}55`, borderRadius: 6, padding: "3px 9px" }}>APPROVAL_PENDING</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 13.5, color: COLORS.muted }}>draft_email → Kexun Zhang · ChipAgents</span>
          </div>
          <div style={{ padding: "20px 24px", fontFamily: FONT.sans, fontSize: 16.5, lineHeight: 1.6, color: COLORS.fg }}>
            <span style={{ color: COLORS.muted }}>subject:</span> multi-agent orchestration for ASIC verification<br />
            <span style={{ color: "#dde4ee" }}>
              hi kexun, i build a multi-agent LLM framework for design-verification engineers at intel, so chipagents' orchestration work is right in my lane. would love to compare notes on how you structure the planner...
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, padding: "0 24px 22px" }}>
            {btns.map((b, i) => {
              const bs = spring({ frame: frame - 90 - i * 8, fps: 30, config: { damping: 200 } });
              return (
                <span key={b.label} style={{ opacity: bs, fontFamily: FONT.mono, fontSize: 14, color: b.c, padding: "10px 22px", borderRadius: 10, border: `1px solid ${b.c}66`, background: `${b.c}12` }}>{b.label}</span>
              );
            })}
          </div>
        </div>

        <div style={{ opacity: pause, fontFamily: FONT.mono, fontSize: 15, color: COLORS.amber, marginTop: 4 }}>
          HIGH / CRITICAL alarms pause the run for human acknowledgment — nothing sends on its own.
        </div>
      </Stage>
      <Caption text="every outbound draft stops at a review gate: approve, edit, or reject. high and critical alarms halt the run until you acknowledge them. the harness escalates instead of guessing." delay={24} />
    </>
  );
};

// ── 9 · SWAPPABLE WORKER + PORTABILITY ───────────────────────────────────────
const AGENT_IFACE = [
  "// The ONLY thing the harness asks of a worker.",
  "export interface Agent {",
  "  id: string;",
  "  run(input: AgentInput): Promise<AgentOutput>;",
  "}",
  "",
  "// input.callTool is ALREADY wrapped with guardrails +",
  "// observability — the worker can never bypass a pillar.",
];
const SWAP_CODE = [
  "// Same harness. Drop in a different brain. Zero pillar changes.",
  'createClaudeWorker()  // id: "claude-agent-sdk"  → claude-sonnet-4-6',
  'createClaudeWorker()  // id: "claude-agent-sdk"  → claude-opus-4-8',
  'createEchoWorker()    // id: "echo-heuristic"    → no LLM, no auth',
];

export const Swap: React.FC = () => {
  const frame = useCurrentFrame();
  const swapHi = frame > 330 ? 1 : 0;
  return (
    <>
      <Stage dur={SCENES.swap} center={false} pad={72}>
        <Kicker delay={2} tag="SHOULD #7 · BONUS #10" tagColor={COLORS.teal}>swappable worker</Kicker>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%" }}>
          <CodeBlock title="server/src/lib/harness/types.ts" lines={AGENT_IFACE} startFrame={14} perLine={5} width={1000} fontSize={19} showLineNumbers={false} />
          <CodeBlock
            title="server/src/lib/agents/*  — three workers, one interface"
            lines={SWAP_CODE}
            startFrame={150}
            perLine={7}
            width={1000}
            fontSize={18}
            showLineNumbers={false}
            highlight={[2, 3]}
            highlightAt={330}
            highlightColor={COLORS.teal}
          />
        </div>
        <div style={{ opacity: swapHi ? interpolate(frame, [330, 350], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0, display: "flex", gap: 14, alignItems: "center", fontFamily: FONT.mono, fontSize: 16, color: "#fff" }}>
          <span style={{ color: COLORS.blueSoft }}>sonnet 4.6</span>
          <span style={{ color: COLORS.faint }}>→</span>
          <span style={{ color: COLORS.lilac }}>opus 4.8</span>
          <span style={{ color: COLORS.faint }}>→</span>
          <span style={{ color: COLORS.green }}>echo-heuristic (no LLM)</span>
          <span style={{ marginLeft: 14, color: COLORS.teal }}>· same four pillars apply unchanged</span>
        </div>
      </Stage>
      <Caption text="a worker is just an Agent: run(input) returns AgentOutput. swap sonnet 4.6 for opus 4.8, or drop in a dependency-free heuristic worker — every call still flows through the same guardrails, checkpoints and alarms. zero harness changes." delay={150} />
    </>
  );
};

// ── 10 · REAL DEMO PAYOFF ────────────────────────────────────────────────────
export const Payoff: React.FC = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [60, 620], [0, 0.78], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const harnessMd = spring({ frame: frame - 540, fps: 30, config: { damping: 200 } });
  return (
    <>
      <Stage dur={SCENES.payoff} center={false} pad={64}>
        <Kicker delay={2} tag="MUST #5 · #6" tagColor={COLORS.blueSoft}>today's real brief · HARNESS.md</Kicker>
      </Stage>
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 110, top: 170, width: 760, height: 820, overflow: "hidden", borderRadius: 22, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,10,15,0.45)", padding: "30px 40px", maskImage: "linear-gradient(180deg, transparent 0, #000 60px, #000 86%, transparent 100%)" }}>
          <BriefMock scroll={scroll} width={680} />
        </div>
        {/* HARNESS.md callout */}
        <div style={{ position: "absolute", right: 470, top: 360, width: 420, opacity: harnessMd, transform: `translateX(${interpolate(harnessMd, [0, 1], [40, 0])}px)` }}>
          <div style={{ borderRadius: 16, padding: "22px 24px", background: "rgba(10,12,18,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.16em", color: COLORS.teal }}>HARNESS.md</div>
            <div style={{ fontFamily: FONT.sans, fontSize: 16, lineHeight: 1.55, color: COLORS.muted, marginTop: 10 }}>
              the architecture is documented in the repo — four pillars, the bounded loop, every guardrail and alarm type, and how to swap the worker.
            </div>
          </div>
        </div>
      </AbsoluteFill>
      <Caption text="this is my actual brief from this morning, rendered live. roche's pathai deal, the agent sdk billing split, a draft to a chipagents founder. real input, real output. the architecture is written up in HARNESS.md." delay={20} />
    </>
  );
};

// ── 11 · CLOSE ───────────────────────────────────────────────────────────────
export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const tagline = spring({ frame: frame - 40, fps: 30, config: { damping: 200 } });
  const meta = interpolate(frame, [90, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const allTicked = frame > 60;
  return (
    <Stage dur={SCENES.close}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <SparkleRow startFrame={4} />
        <Wordmark size={188} startFrame={0} />
        <div style={{ opacity: tagline, transform: `translateY(${interpolate(tagline, [0, 1], [14, 0])}px)`, fontFamily: FONT.display, fontSize: 30, fontWeight: 500, color: COLORS.fg }}>
          ten rubric points. four pillars. built in 24 hours.
        </div>
        {/* tick recap */}
        <div style={{ display: "flex", gap: 8, opacity: allTicked ? interpolate(frame, [60, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0 }}>
          {RUBRIC.map((r, i) => (
            <span key={r.n} style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.mono, fontSize: 12, color: COLORS.green, border: `1px solid ${COLORS.green}66`, background: `${COLORS.green}15` }}>✓</span>
          ))}
        </div>
        <div style={{ opacity: meta, display: "flex", gap: 26, fontFamily: FONT.mono, fontSize: 15, color: COLORS.faint, marginTop: 8 }}>
          <span>github.com/rishik/solo</span>
          <span style={{ color: COLORS.blueSoft }}>·</span>
          <span>solo.demo</span>
        </div>
      </div>
    </Stage>
  );
};
