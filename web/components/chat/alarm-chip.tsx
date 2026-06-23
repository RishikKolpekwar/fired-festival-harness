"use client";

import { AlertTriangle } from "lucide-react";
import type { Alarm } from "@/lib/types";
import { severityStyles } from "@/lib/severity";
import { cn } from "@/lib/utils";

/** A single structured alarm, colored by severity. */
export function AlarmChip({ alarm }: { alarm: Alarm }) {
  const s = severityStyles[alarm.severity];
  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs animate-in fade-in slide-in-from-left-1 duration-200",
        s.chip,
      )}
      title={alarm.recommendedAction}
    >
      <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("font-semibold tracking-wide", s.label)}>
            {alarm.type.replaceAll("_", " ")}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              s.chip,
            )}
          >
            {alarm.severity}
          </span>
        </div>
        <p className="mt-0.5 text-[#b4b4ba]">{alarm.context}</p>
        <p className="mt-0.5 text-[#7a7a80]">
          <span className="text-[#9a9aa0]">→</span> {alarm.recommendedAction}
        </p>
      </div>
    </div>
  );
}
