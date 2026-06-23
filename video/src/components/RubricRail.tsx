import React from "react";
import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { COLORS, FONT, RAIL_W } from "../theme";
import { RUBRIC, Tier } from "../timeline";

const TIER_COLOR: Record<Tier, string> = {
  MUST: COLORS.blueSoft,
  SHOULD: COLORS.teal,
  BONUS: COLORS.amber,
};

const Check: React.FC<{ on: boolean; t: number; color: string }> = ({ on, t, color }) => {
  // animated tick: ring fills + checkmark draws
  const fill = on ? interpolate(t, [0, 10], [0, 1], { extrapolateRight: "clamp" }) : 0;
  const draw = on ? interpolate(t, [4, 16], [0, 1], { extrapolateRight: "clamp" }) : 0;
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        flexShrink: 0,
        border: `1.5px solid ${on ? color : "rgba(255,255,255,0.18)"}`,
        background: on ? `${color}22` : "transparent",
        boxShadow: on ? `0 0 ${12 * fill}px ${color}88` : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path
          d="M3 8.5 L6.5 12 L13 4"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="20"
          strokeDashoffset={20 - 20 * draw}
        />
      </svg>
    </div>
  );
};

export const RubricRail: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const doneCount = RUBRIC.filter((r) => frame >= r.tickAt).length;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: RAIL_W,
        transform: `translateX(${interpolate(intro, [0, 1], [RAIL_W, 0])}px)`,
        background: "linear-gradient(180deg, rgba(8,10,15,0.72) 0%, rgba(8,10,15,0.55) 100%)",
        backdropFilter: "blur(14px)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        padding: "30px 26px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: COLORS.muted,
          }}
        >
          rubric coverage
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 14, color: COLORS.blueSoft }}>
          {doneCount.toString().padStart(2, "0")}
          <span style={{ color: COLORS.faint }}>/10</span>
        </div>
      </div>

      {/* progress bar */}
      <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${(doneCount / 10) * 100}%`,
            background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.teal})`,
            transition: "none",
            boxShadow: `0 0 12px ${COLORS.blue}`,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 6 }}>
        {RUBRIC.map((r) => {
          const on = frame >= r.tickAt;
          const t = frame - r.tickAt;
          const tc = TIER_COLOR[r.tier];
          const justTicked = on && t < 22;
          return (
            <div
              key={r.n}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "9px 11px",
                borderRadius: 12,
                background: justTicked ? `${tc}1f` : on ? "rgba(255,255,255,0.025)" : "transparent",
                border: `1px solid ${justTicked ? `${tc}66` : "rgba(255,255,255,0.05)"}`,
                opacity: on ? 1 : 0.5,
              }}
            >
              <Check on={on} t={t} color={tc} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span
                    style={{
                      fontFamily: FONT.mono,
                      fontSize: 9.5,
                      letterSpacing: "0.12em",
                      color: tc,
                      border: `1px solid ${tc}55`,
                      borderRadius: 5,
                      padding: "1px 5px",
                    }}
                  >
                    {r.tier}
                  </span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.faint }}>#{r.n}</span>
                </div>
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 13.5,
                    lineHeight: 1.32,
                    color: on ? COLORS.fg : COLORS.muted,
                  }}
                >
                  {r.short}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 11,
          letterSpacing: "0.1em",
          color: COLORS.faint,
          textAlign: "center",
        }}
      >
        s01o · gauntlet ai build challenge
      </div>
    </div>
  );
};
