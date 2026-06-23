import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { COLORS, FONT, STAGE_RIGHT } from "../theme";

// Wraps a scene: fades at its own edges and keeps content clear of the rubric rail.
export const Stage: React.FC<{
  dur: number;
  children: React.ReactNode;
  pad?: number;
  center?: boolean;
  justify?: "center" | "flex-start";
}> = ({ dur, children, pad = 96, center = true, justify }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 16, dur - 16, dur], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          right: STAGE_RIGHT,
          padding: pad,
          display: "flex",
          flexDirection: "column",
          alignItems: center ? "center" : "flex-start",
          justifyContent: justify ?? "center",
          gap: 30,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

// mono UPPERCASE tracked micro-label with a tier chip option
export const Kicker: React.FC<{
  children: React.ReactNode;
  delay?: number;
  color?: string;
  tag?: string;
  tagColor?: string;
}> = ({ children, delay = 0, color = COLORS.blueSoft, tag, tagColor }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: o }}>
      {tag && (
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            letterSpacing: "0.14em",
            color: tagColor ?? color,
            border: `1px solid ${(tagColor ?? color)}66`,
            borderRadius: 6,
            padding: "3px 9px",
          }}
        >
          {tag}
        </span>
      )}
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 17,
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color,
        }}
      >
        {children}
      </span>
    </div>
  );
};

// Lower-third narration caption (the VO script shows on screen, scene-timed).
export const Caption: React.FC<{ text: string; delay?: number }> = ({ text, delay = 8 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [delay, delay + 14], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        right: STAGE_RIGHT + 96,
        bottom: 64,
        opacity: o,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 24px",
          borderRadius: 16,
          background: "rgba(8,10,15,0.66)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.08)",
          maxWidth: "100%",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: COLORS.teal,
            boxShadow: `0 0 10px ${COLORS.teal}`,
            flexShrink: 0,
          }}
        />
        <span style={{ fontFamily: FONT.sans, fontSize: 23, lineHeight: 1.4, color: COLORS.fg }}>{text}</span>
      </div>
    </div>
  );
};
