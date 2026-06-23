"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  Wrench,
  X,
} from "lucide-react";
import type { StatusEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ToolLine = Pick<StatusEvent, "id" | "label" | "tool" | "state">;

function StateIcon({ state }: { state: ToolLine["state"] }) {
  if (state === "start")
    return <Loader2 className="size-3.5 animate-spin text-[#1488fc]" />;
  if (state === "error") return <X className="size-3.5 text-red-400" />;
  return <Check className="size-3.5 text-emerald-400" />;
}

/**
 * Live tool-call trace. While the turn is streaming, shows each status line.
 * Once `done`, collapses to a "used N tools" pill that re-expands on click.
 */
export function ToolStatus({
  lines,
  done,
}: {
  lines: ToolLine[];
  done: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (lines.length === 0) return null;

  const count = lines.length;

  if (done && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-[#8a8a8f] transition-colors hover:text-white"
      >
        <Wrench className="size-3" />
        used {count} tool{count === 1 ? "" : "s"}
        <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </button>
    );
  }

  return (
    <div className="space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      {done && (
        <button
          onClick={() => setExpanded(false)}
          className="mb-1 flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6a6a6f] hover:text-[#9a9aa0]"
        >
          <Wrench className="size-3" />
          {count} tool{count === 1 ? "" : "s"} used
        </button>
      )}
      {lines.map((line) => (
        <div
          key={line.id}
          className={cn(
            "flex items-center gap-2 text-[12.5px] animate-in fade-in slide-in-from-left-1 duration-200",
            line.state === "start" ? "text-[#c4c4ca]" : "text-[#8a8a8f]",
          )}
        >
          <StateIcon state={line.state} />
          <span>{line.label}</span>
        </div>
      ))}
    </div>
  );
}
