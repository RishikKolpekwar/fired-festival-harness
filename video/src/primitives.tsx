import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from "remotion";
import { COLORS, FONT } from "./theme";

export const Eyebrow: React.FC<{ children: React.ReactNode; delay?: number; color?: string }> = ({
  children,
  delay = 0,
  color = COLORS.blueSoft,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 18,
        letterSpacing: "0.26em",
        textTransform: "uppercase",
        color,
        opacity: o,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 12px ${color}`,
        }}
      />
      {children}
    </div>
  );
};

// Word-by-word rise-in headline
export const RiseHeadline: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  color?: string;
  weight?: number;
}> = ({ text, delay = 0, size = 64, color = "#fff", weight = 600 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div
      style={{
        fontFamily: FONT.display,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: "-0.02em",
        lineHeight: 1.08,
        color,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 0.32em",
        maxWidth: 1300,
        textAlign: "center",
      }}
    >
      {words.map((w, i) => {
        const d = delay + i * 3;
        const s = spring({ frame: frame - d, fps, config: { damping: 200 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: s,
              transform: `translateY(${interpolate(s, [0, 1], [28, 0])}px)`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

export const GlassCard: React.FC<{
  delay?: number;
  accent?: string;
  width?: number;
  children: React.ReactNode;
}> = ({ delay = 0, accent = COLORS.blue, width = 360, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 180, mass: 0.9 } });
  return (
    <div
      style={{
        width,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px) scale(${interpolate(
          s,
          [0, 1],
          [0.94, 1]
        )})`,
        borderRadius: 22,
        padding: "30px 30px 34px",
        background: "rgba(13,16,24,0.55)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: `0 24px 60px -28px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.06)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />
      {children}
    </div>
  );
};

// Animated conic beam border ring (matches .beam-border)
export const BeamPill: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const beam = (frame * 4) % 360;
  const o = interpolate(frame, [delay, delay + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "relative", opacity: o, borderRadius: 999 }}>
      <div
        style={{
          position: "absolute",
          inset: -1.5,
          borderRadius: 999,
          padding: 1.5,
          background: `conic-gradient(from ${beam}deg, transparent 0deg, ${COLORS.blue}b3 40deg, ${COLORS.teal}99 90deg, transparent 140deg)`,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 16,
          letterSpacing: "0.12em",
          color: COLORS.blueSoft,
          padding: "12px 26px",
          borderRadius: 999,
          background: "rgba(10,12,18,0.6)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const fadeAt = (
  frame: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number
) =>
  interpolate(
    frame,
    [inStart, inEnd, outStart, outEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) }
  );
