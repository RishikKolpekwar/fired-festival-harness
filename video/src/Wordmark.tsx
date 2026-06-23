import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from "remotion";
import { COLORS, FONT } from "./theme";

// Neon RGB chromatic-aberration "s01o" wordmark (matches the WebGL hero glyph).
export const Wordmark: React.FC<{ size?: number; startFrame?: number }> = ({
  size = 200,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const appear = spring({ frame: f, fps, config: { damping: 200, mass: 1.2 } });
  // chromatic split eases from wide+blurred to tight+sharp ("final blurred" state)
  const split = interpolate(f, [0, 45], [26, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const blur = interpolate(f, [0, 45], [18, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const flicker = 1 + Math.sin(f * 0.35) * 0.04;

  const base: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    fontFamily: FONT.display,
    fontWeight: 700,
    fontSize: size,
    letterSpacing: "-0.04em",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  };

  return (
    <div
      style={{
        position: "relative",
        width: size * 3.2,
        height: size * 1.3,
        opacity: appear,
        transform: `scale(${interpolate(appear, [0, 1], [0.85, 1])})`,
      }}
    >
      {/* glow bed */}
      <div
        style={{
          ...base,
          color: COLORS.blue,
          filter: `blur(${blur + 16}px)`,
          opacity: 0.55 * flicker,
        }}
      >
        s01o
      </div>
      {/* red channel */}
      <div
        style={{
          ...base,
          color: "#ff3b7b",
          transform: `translateX(${-split}px)`,
          mixBlendMode: "screen",
          filter: `blur(${blur}px)`,
        }}
      >
        s01o
      </div>
      {/* blue channel */}
      <div
        style={{
          ...base,
          color: COLORS.blueSoft,
          transform: `translateX(${split}px)`,
          mixBlendMode: "screen",
          filter: `blur(${blur}px)`,
        }}
      >
        s01o
      </div>
      {/* green/teal channel */}
      <div
        style={{
          ...base,
          color: COLORS.teal,
          transform: `translateY(${split * 0.4}px)`,
          mixBlendMode: "screen",
          filter: `blur(${blur}px)`,
          opacity: 0.85,
        }}
      >
        s01o
      </div>
      {/* crisp white core */}
      <div
        style={{
          ...base,
          color: "#ffffff",
          filter: `blur(${Math.max(blur - 1, 0)}px)`,
          textShadow: `0 0 ${24 * flicker}px rgba(20,136,252,0.55)`,
        }}
      >
        s01o
      </div>
    </div>
  );
};

// 5-glyph animated sparkle row that sits above the wordmark.
export const SparkleRow: React.FC<{ startFrame?: number }> = ({ startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const glyphs = ["✦", "✧", "✦", "✶", "✦"];
  return (
    <div style={{ display: "flex", gap: 26, justifyContent: "center" }}>
      {glyphs.map((g, i) => {
        const tw = (Math.sin(f * 0.18 + i * 1.3) + 1) / 2;
        const appear = interpolate(f, [i * 4, i * 4 + 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              fontSize: 26,
              color: i % 2 ? COLORS.teal : COLORS.blueSoft,
              opacity: appear * (0.4 + tw * 0.6),
              transform: `scale(${0.8 + tw * 0.4})`,
              textShadow: `0 0 12px ${i % 2 ? COLORS.teal : COLORS.blue}`,
            }}
          >
            {g}
          </span>
        );
      })}
    </div>
  );
};
