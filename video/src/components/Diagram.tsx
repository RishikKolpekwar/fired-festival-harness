import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../theme";

const PILLARS = [
  { key: "material", n: "PILLAR 2", label: "Material handling", file: "tools/*.ts", c: COLORS.teal, desc: "sources → one Signal" },
  { key: "guardrails", n: "PILLAR 3", label: "Guardrails", file: "guardrails.ts", c: COLORS.blueSoft, desc: "input · action · output" },
  { key: "checkpoints", n: "PILLAR 4a", label: "Checkpoints", file: "brief.ts", c: COLORS.amber, desc: "pass/fail · replayable" },
  { key: "alarms", n: "PILLAR 4b", label: "Alarms", file: "observability.ts", c: COLORS.rose, desc: "typed · structured" },
];

// reveal: 0 worker, 1 loop ring, 2.. pillars in. `focus` highlights one pillar key.
export const Diagram: React.FC<{ startFrame?: number; focus?: string }> = ({ startFrame = 0, focus }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const worker = spring({ frame: f, fps, config: { damping: 200 } });
  const ring = spring({ frame: f - 14, fps, config: { damping: 200 } });

  const W = 1180;
  const H = 620;
  const cx = W / 2;
  const cy = H / 2;
  const positions = [
    { x: cx - 380, y: cy - 150 },
    { x: cx + 380, y: cy - 150 },
    { x: cx - 380, y: cy + 150 },
    { x: cx + 380, y: cy + 150 },
  ];

  return (
    <div style={{ position: "relative", width: W, height: H }}>
      {/* connecting lines */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {positions.map((p, i) => {
          const a = spring({ frame: f - 26 - i * 6, fps, config: { damping: 200 } });
          const c = PILLARS[i].c;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + (p.x - cx) * a}
              y2={cy + (p.y - cy) * a}
              stroke={c}
              strokeWidth={2}
              strokeDasharray="5 6"
              opacity={0.5 * a}
            />
          );
        })}
      </svg>

      {/* loop ring */}
      <div
        style={{
          position: "absolute",
          left: cx - 250,
          top: cy - 120,
          width: 500,
          height: 240,
          borderRadius: 140,
          border: `1.5px dashed ${COLORS.blue}66`,
          opacity: ring * 0.8,
          transform: `scale(${interpolate(ring, [0, 1], [0.8, 1])})`,
          boxShadow: `0 0 60px -20px ${COLORS.blue}`,
        }}
      />
      <div style={{ position: "absolute", left: cx - 250, top: cy - 150, opacity: ring, fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.16em", color: COLORS.blue, width: 500, textAlign: "center" }}>
        PILLAR 1 · BOUNDED LOOP — MAX_TURNS 8 · 120s · $0.50
      </div>

      {/* worker */}
      <div
        style={{
          position: "absolute",
          left: cx - 150,
          top: cy - 56,
          width: 300,
          height: 112,
          borderRadius: 18,
          opacity: worker,
          transform: `scale(${interpolate(worker, [0, 1], [0.85, 1])})`,
          background: "linear-gradient(135deg, rgba(20,136,252,0.22), rgba(94,227,192,0.14))",
          border: "1.5px solid rgba(124,192,255,0.5)",
          boxShadow: `0 0 50px -16px ${COLORS.blue}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <span style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.18em", color: COLORS.blueSoft }}>THE WORKER</span>
        <span style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: 600, color: "#fff" }}>Claude Agent SDK</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.muted }}>reasons · asks for tools</span>
      </div>

      {/* pillars */}
      {PILLARS.map((p, i) => {
        const a = spring({ frame: f - 30 - i * 6, fps, config: { damping: 180 } });
        const pos = positions[i];
        const dim = focus ? (focus === p.key ? 1 : 0.32) : 1;
        const isFocus = focus === p.key;
        return (
          <div
            key={p.key}
            style={{
              position: "absolute",
              left: pos.x - 150,
              top: pos.y - 58,
              width: 300,
              opacity: a * dim,
              transform: `translateY(${interpolate(a, [0, 1], [20, 0])}px) scale(${isFocus ? 1.05 : 1})`,
              borderRadius: 16,
              padding: "16px 20px",
              background: "rgba(13,16,24,0.7)",
              border: `1.5px solid ${p.c}${isFocus ? "" : "55"}`,
              boxShadow: isFocus ? `0 0 44px -12px ${p.c}` : `0 14px 40px -28px ${p.c}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.12em", color: p.c }}>{p.n}</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.faint }}>{p.file}</span>
            </div>
            <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: "#fff", marginTop: 6 }}>{p.label}</div>
            <div style={{ fontFamily: FONT.sans, fontSize: 14, color: COLORS.muted, marginTop: 3 }}>{p.desc}</div>
          </div>
        );
      })}
    </div>
  );
};
