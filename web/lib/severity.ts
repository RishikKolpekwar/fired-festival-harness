import type { AlarmSeverity } from "./types";

// Severity → color treatment. low→gray, medium→amber, high→orange, critical→red
// (per FRONTEND_TASKS.md alarm-chip spec).
export const severityStyles: Record<
  AlarmSeverity,
  { chip: string; dot: string; label: string }
> = {
  low: {
    chip: "border-white/10 bg-white/[0.04] text-[#9a9aa0]",
    dot: "bg-[#9a9aa0]",
    label: "text-[#9a9aa0]",
  },
  medium: {
    chip: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
    label: "text-amber-300",
  },
  high: {
    chip: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    dot: "bg-orange-400",
    label: "text-orange-300",
  },
  critical: {
    chip: "border-red-500/35 bg-red-500/12 text-red-300",
    dot: "bg-red-400",
    label: "text-red-300",
  },
};

export const sourceStateStyles: Record<"ok" | "degraded", string> = {
  ok: "bg-emerald-400",
  degraded: "bg-amber-400",
};
