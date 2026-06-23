import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig, AbsoluteFill } from "remotion";
import { COLORS, FONT } from "../theme";
import { SCENES } from "../timeline";
import { Wordmark, SparkleRow } from "../Wordmark";
import { RiseHeadline } from "../primitives";
import { Stage, Kicker, Caption } from "../components/Stage";
import { CodeBlock } from "../components/CodeBlock";
import { Diagram } from "../components/Diagram";
import { ChatMock } from "../ui/ChatMock";
import { BriefMock } from "../ui/BriefMock";

// ── 1 · COLD OPEN ────────────────────────────────────────────────────────────
export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const sub = interpolate(frame, [78, 104], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const meta = interpolate(frame, [104, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage dur={SCENES.coldOpen}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <SparkleRow startFrame={8} />
        <Wordmark size={188} startFrame={0} />
        <div style={{ opacity: sub, transform: `translateY(${interpolate(sub, [0, 1], [16, 0])}px)`, fontFamily: FONT.display, fontSize: 34, fontWeight: 500, letterSpacing: "-0.01em", color: COLORS.fg }}>
          one harness. one worker. four pillars.
        </div>
        <div style={{ opacity: meta, fontFamily: FONT.mono, fontSize: 16, letterSpacing: "0.22em", textTransform: "uppercase", color: COLORS.faint, marginTop: 6 }}>
          gauntlet ai · 24-hour build challenge · rishik kolpekwar
        </div>
      </div>
    </Stage>
  );
};

// ── 2 · THE IDEA ─────────────────────────────────────────────────────────────
export const Idea: React.FC = () => {
  const frame = useCurrentFrame();
  // chat slides to the left, brief rises on the right
  const chatX = spring({ frame: frame - 30, fps: 30, config: { damping: 200 } });
  const briefIn = spring({ frame: frame - 150, fps: 30, config: { damping: 200 } });
  const scroll = interpolate(frame, [330, 640], [0, 0.62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Stage dur={SCENES.idea} center={false} pad={72} justify="flex-start">
        <Kicker delay={4} tag="MUST #5" tagColor={COLORS.blueSoft}>runs on my real data</Kicker>
        <RiseHeadline text="solo reads your world and writes your morning brief." delay={10} size={40} />
      </Stage>
      {/* device cluster — sits below the header */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 64, top: 300, transform: `translateX(${interpolate(chatX, [0, 1], [-80, 0])}px) scale(0.58)`, transformOrigin: "top left", opacity: chatX }}>
          <ChatMock />
        </div>
        <div style={{ position: "absolute", right: 452, top: 320, width: 452, height: 660, overflow: "hidden", borderRadius: 22, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,10,15,0.5)", opacity: briefIn, transform: `translateY(${interpolate(briefIn, [0, 1], [40, 0])}px)`, padding: "24px 28px", maskImage: "linear-gradient(180deg, #000 88%, transparent 100%)" }}>
          <BriefMock scroll={scroll} width={396} />
        </div>
      </AbsoluteFill>
      <Caption text="news, RSS, jobs, your inbox and calendar — pulled live, ranked, and written up in your voice." delay={150} />
    </>
  );
};

// ── 3 · ARCHITECTURE ─────────────────────────────────────────────────────────
export const Architecture: React.FC = () => {
  return (
    <>
      <Stage dur={SCENES.architecture} pad={64}>
        <Kicker delay={2} tag="MUST #1" tagColor={COLORS.blueSoft}>four pillars, separate from the worker</Kicker>
        <div style={{ marginTop: -6 }}>
          <Diagram startFrame={20} />
        </div>
      </Stage>
      <Caption
        text="the worker only reasons and asks for tools. four named modules — material handling, guardrails, checkpoints, alarms — wrap it inside a bounded loop. swap the worker, the pillars never move."
        delay={40}
      />
    </>
  );
};

// ── 4 · MATERIAL HANDLING ────────────────────────────────────────────────────
const TOOL_CODE = [
  "// PILLAR 2 — material handling. Every tool is the same contract.",
  "export const searchNews: Tool = {",
  '  name: "search_news",',
  '  effect: "read",                       // drives action-guardrails',
  "  parameters: { query: { type: \"string\", required: true } },",
  "  async execute({ query }) {",
  "    const res = await exa.searchAndContents(query, { numResults: 6 });",
  "    const signals: Signal[] = res.results.map((r) => ({",
  "      id: nanoid(), source: \"news\", title: r.title, body: r.text,",
  "      url: r.url, ts: r.publishedDate,   // → ONE normalized Signal",
  "    }));",
  "    return { ok: true, data, error: null, signals };  // errors are DATA",
  "  },",
  "};",
];

export const Material: React.FC = () => {
  const frame = useCurrentFrame();
  const sigIn = spring({ frame: frame - 250, fps: 30, config: { damping: 200 } });
  const sources = [
    { k: "news · exa", c: COLORS.blueSoft },
    { k: "rss · 20vc", c: COLORS.teal },
    { k: "jobs", c: COLORS.green },
    { k: "imessage", c: COLORS.lilac },
    { k: "gmail · calendar", c: COLORS.amber },
  ];
  return (
    <>
      <Stage dur={SCENES.material} center={false} pad={72}>
        <Kicker delay={2} tag="MUST #1" tagColor={COLORS.teal}>material handling · tools/</Kicker>
        <div style={{ display: "flex", gap: 40, alignItems: "center", width: "100%" }}>
          <CodeBlock title="server/src/lib/tools/news.ts" lines={TOOL_CODE} startFrame={16} perLine={4} width={840} fontSize={18.5} highlight={[7, 8, 9]} highlightAt={140} highlightColor={COLORS.teal} />
          {/* funnel: raw sources → one Signal */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: sigIn, transform: `translateX(${interpolate(sigIn, [0, 1], [30, 0])}px)` }}>
            {sources.map((s, i) => (
              <div key={i} style={{ fontFamily: FONT.mono, fontSize: 14, color: s.c, padding: "8px 14px", borderRadius: 9, border: `1px solid ${s.c}44`, background: `${s.c}10`, textAlign: "center" }}>{s.k}</div>
            ))}
            <div style={{ textAlign: "center", color: COLORS.faint, fontSize: 22 }}>↓</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 15, color: "#fff", padding: "12px 16px", borderRadius: 11, background: "linear-gradient(135deg, rgba(94,227,192,0.2), rgba(20,136,252,0.15))", border: "1.5px solid rgba(94,227,192,0.5)", textAlign: "center" }}>
              Signal{`{ source, title, relevance 0..1 }`}
            </div>
          </div>
        </div>
      </Stage>
      <Caption text="every source — Exa news, RSS, job boards, iMessage, Gmail — normalizes into one Signal type, scored and deduped. clean interface in, clean data out. a failing source returns an error as data, it never crashes the run." delay={250} />
    </>
  );
};
