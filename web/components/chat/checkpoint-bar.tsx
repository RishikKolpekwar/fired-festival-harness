"use client";

import { Check, X } from "lucide-react";
import type { CheckpointEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Renders the brief-pipeline checkpoints (fetch → score → … → deliver). */
export function CheckpointBar({ checkpoints }: { checkpoints: CheckpointEvent[] }) {
  if (checkpoints.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {checkpoints.map((c, i) => (
        <span
          key={`${c.stage}-${i}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium animate-in fade-in zoom-in-95 duration-200",
            c.status === "pass"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300",
          )}
        >
          {c.status === "pass" ? (
            <Check className="size-2.5" />
          ) : (
            <X className="size-2.5" />
          )}
          {c.stage}
        </span>
      ))}
    </div>
  );
}
