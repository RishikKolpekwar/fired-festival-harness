import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../theme";

// Compact inline "s01o" neon wordmark (chromatic aberration), for use inside mocks.
export const NeonWord: React.FC<{ size?: number; split?: number }> = ({ size = 92, split = 4 }) => {
  const frame = useCurrentFrame();
  const flick = 1 + Math.sin(frame * 0.3) * 0.05;
  const layer = (color: string, dx: number, dy = 0, blur = 1, op = 1): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONT.display,
    fontWeight: 700,
    fontSize: size,
    letterSpacing: "-0.04em",
    color,
    transform: `translate(${dx}px, ${dy}px)`,
    filter: `blur(${blur}px)`,
    mixBlendMode: "screen",
    opacity: op,
  });
  return (
    <div style={{ position: "relative", width: size * 2.6, height: size * 1.2 }}>
      <div style={{ ...layer(COLORS.blue, 0, 0, 16, 0.5 * flick), mixBlendMode: "normal" }}>s01o</div>
      <div style={layer("#ff3b7b", -split, 0, split * 0.5)}>s01o</div>
      <div style={layer(COLORS.blueSoft, split, 0, split * 0.5)}>s01o</div>
      <div style={layer(COLORS.teal, 0, split * 0.4, split * 0.5, 0.85)}>s01o</div>
      <div style={{ ...layer("#ffffff", 0, 0, 0.4), mixBlendMode: "normal", textShadow: `0 0 ${22 * flick}px ${COLORS.blue}88` }}>s01o</div>
    </div>
  );
};
