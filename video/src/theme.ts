// Single source of truth for the look — palette + type system lifted from
// solo/web (globals.css + brief-view.tsx) so the video matches the product.
export const COLORS = {
  bg: "#06070b",
  bgAlt: "#0f0f0f",
  panel: "rgba(13,16,24,0.55)",
  panelStrong: "rgba(10,12,18,0.82)",
  border: "rgba(255,255,255,0.09)",
  fg: "#ededed",
  blue: "#1488fc", // primary neon
  blueSoft: "#7cc0ff",
  blueGlow: "#3a9bff",
  lilac: "#a9b8ff",
  teal: "#5ee3c0",
  tealBright: "#72efdd",
  amber: "#ffb86b",
  rose: "#ff6b8b",
  green: "#5ee389",
  muted: "#9aa3b2",
  faint: "#6a6a6f",
};

// Severity → color (matches the alarm model)
export const SEVERITY: Record<string, string> = {
  low: COLORS.blueSoft,
  medium: COLORS.amber,
  high: "#ff9d5c",
  critical: COLORS.rose,
};

// Syntax token colors for the code blocks
export const CODE = {
  bg: "rgba(8,10,15,0.92)",
  plain: "#c8d0dc",
  comment: "#5f6b7e",
  keyword: "#7cc0ff",
  string: "#5ee3c0",
  number: "#ffb86b",
  ident: "#e6ebf2",
  type: "#a9b8ff",
  punct: "#8a93a3",
  const: "#ff9d5c",
};

export const FONT = {
  display: "Space Grotesk, system-ui, sans-serif",
  mono: "Geist Mono, ui-monospace, monospace",
  sans: "Geist, system-ui, sans-serif",
};

export const FPS = 30;

// Layout: a right rubric rail + a left content stage.
export const RAIL_W = 392;
export const STAGE_RIGHT = RAIL_W; // content keeps clear of the rail
