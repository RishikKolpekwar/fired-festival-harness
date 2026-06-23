import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../theme";
import { NeonWord } from "./NeonWord";

// A faithful recreation of the s01o chat home (BoltStyleChat): neon wordmark,
// time-aware greeting, glass input with beam border, personalized chips, and a
// streaming assistant reply with tool-status pills. Driven by springs.
const CHIPS = [
  "what moved in pathology ai today",
  "draft a follow up to the paige team",
  "any er/pr biomarker papers this week",
  "jobs that fit my intel dv work",
];

const STATUS = [
  { t: "search_news · exa", c: COLORS.blueSoft },
  { t: "fetch_rss · 20vc", c: COLORS.teal },
  { t: "read_calendar", c: COLORS.lilac },
];

export const ChatMock: React.FC<{ scale?: number }> = ({ scale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reply =
    "two things move today, both on your direct path. anthropic splits agent sdk billing into its own capped credit pool june 15, so your harness draws from that pool now. on the pathology side, roche is closing a $1.05b pathai deal...";
  const typed = Math.floor(interpolate(frame, [70, 165], [0, reply.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <div
      style={{
        width: 1180,
        transform: `scale(${scale})`,
        borderRadius: 26,
        background: "rgba(9,11,17,0.66)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 50px 120px -50px rgba(0,0,0,0.9)",
        overflow: "hidden",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: COLORS.green, boxShadow: `0 0 10px ${COLORS.green}` }} />
        <span style={{ fontFamily: FONT.mono, fontSize: 14, color: COLORS.muted, letterSpacing: "0.04em" }}>harness online · localhost:8787</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: FONT.mono, fontSize: 13, color: COLORS.faint }}>claude-sonnet-4-6</span>
      </div>

      <div style={{ padding: "44px 56px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 16, letterSpacing: "0.16em", color: COLORS.muted, marginBottom: 14 }}>
          good morning, rishik
        </div>
        <NeonWord size={92} />

        {/* input */}
        <div style={{ position: "relative", width: 760, marginTop: 34, borderRadius: 16 }}>
          <BeamRing />
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderRadius: 16, background: "rgba(10,12,18,0.7)" }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 19, color: COLORS.muted }}>ask anything, or pull today's brief…</span>
            <div style={{ flex: 1 }} />
            <div style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(180deg, ${COLORS.blueGlow}, ${COLORS.blue})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 20px -6px ${COLORS.blue}` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </div>

        {/* chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 11, justifyContent: "center", marginTop: 22, maxWidth: 780 }}>
          {CHIPS.map((c, i) => {
            const s = spring({ frame: frame - 18 - i * 4, fps, config: { damping: 200 } });
            return (
              <span
                key={i}
                style={{
                  opacity: s,
                  transform: `translateY(${interpolate(s, [0, 1], [10, 0])}px)`,
                  fontFamily: FONT.mono,
                  fontSize: 14.5,
                  color: COLORS.blueSoft,
                  padding: "9px 16px",
                  borderRadius: 999,
                  border: "1px solid rgba(124,192,255,0.22)",
                  background: "rgba(20,136,252,0.06)",
                }}
              >
                {c}
              </span>
            );
          })}
        </div>

        {/* streaming reply */}
        <div style={{ width: 820, marginTop: 30, opacity: interpolate(frame, [62, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {STATUS.map((s, i) => {
              const on = frame > 50 + i * 8;
              return (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: FONT.mono, fontSize: 13, color: s.c, opacity: on ? 1 : 0.3, padding: "5px 11px", borderRadius: 8, border: `1px solid ${s.c}33`, background: `${s.c}10` }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: s.c }} /> {s.t}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.mono, fontSize: 12, color: "#04121f", fontWeight: 700 }}>s0</div>
            <div style={{ fontFamily: FONT.sans, fontSize: 18.5, lineHeight: 1.6, color: COLORS.fg }}>
              {reply.slice(0, typed)}
              <span style={{ opacity: frame % 16 < 8 ? 1 : 0, color: COLORS.teal }}>▍</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BeamRing: React.FC = () => {
  const frame = useCurrentFrame();
  const beam = (frame * 4) % 360;
  return (
    <div
      style={{
        position: "absolute",
        inset: -1.5,
        borderRadius: 16,
        padding: 1.5,
        background: `conic-gradient(from ${beam}deg, transparent 0deg, ${COLORS.blue}b3 50deg, ${COLORS.teal}99 110deg, transparent 170deg)`,
        WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        pointerEvents: "none",
      }}
    />
  );
};
