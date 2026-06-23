import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "./theme";

// Soft WebGL-style aurora, rebuilt with blurred radial blobs so it renders in
// the Remotion compositor (real app uses a WebGL shader; same vibe, CSS-safe).
const Blob: React.FC<{
  color: string;
  size: number;
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  speed: number;
  phase: number;
  opacity: number;
}> = ({ color, size, cx, cy, ax, ay, speed, phase, opacity }) => {
  const frame = useCurrentFrame();
  const t = (frame * speed + phase) * 0.02;
  const x = cx + Math.sin(t) * ax;
  const y = cy + Math.cos(t * 0.8) * ay;
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
        opacity,
        filter: "blur(70px)",
        mixBlendMode: "screen",
      }}
    />
  );
};

export const Aurora: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = interpolate(Math.sin(frame * 0.02), [-1, 1], [0.9, 1.05]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${breathe})` }}>
        <Blob color={COLORS.blue} size={1100} cx={28} cy={32} ax={10} ay={8} speed={1} phase={0} opacity={0.5} />
        <Blob color={COLORS.teal} size={900} cx={72} cy={62} ax={12} ay={9} speed={0.8} phase={40} opacity={0.42} />
        <Blob color={COLORS.lilac} size={820} cx={58} cy={22} ax={9} ay={7} speed={1.2} phase={120} opacity={0.34} />
        <Blob color={COLORS.blueGlow} size={760} cx={20} cy={74} ax={11} ay={6} speed={0.9} phase={200} opacity={0.3} />
      </AbsoluteFill>

      {/* dim + vignette so it reads as ambient light, not a raw shader demo */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 120% at 50% 40%, transparent 0%, rgba(6,7,11,0.55) 70%, rgba(6,7,11,0.92) 100%)",
        }}
      />
      <Grain />
    </AbsoluteFill>
  );
};

const Grain: React.FC = () => {
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
  );
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("data:image/svg+xml,${svg}")`,
        opacity: 0.05,
        mixBlendMode: "overlay",
      }}
    />
  );
};
