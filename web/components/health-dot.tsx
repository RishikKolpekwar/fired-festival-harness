"use client";

import { useState } from "react";
import type { Health } from "@/lib/types";
import { sourceStateStyles } from "@/lib/severity";
import { cn, timeAgo } from "@/lib/utils";

const MODEL_LABEL: Record<string, string> = {
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-8": "Opus 4.8",
  "claude-haiku-4-5": "Haiku 4.5",
};

/** Small "harness running" indicator + model name, with a hover detail card. */
export function HealthDot({
  health,
  error,
}: {
  health: Health | null;
  error: boolean;
}) {
  const [open, setOpen] = useState(false);
  const online = !error && health?.ok;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8a8a8f] transition-colors hover:text-[#e8edf5]">
        <span className="relative flex size-2">
          {online && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5ee3c0] opacity-60" />
          )}
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              online
                ? "bg-[#5ee3c0] shadow-[0_0_8px_#5ee3c0]"
                : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]",
            )}
          />
        </span>
        <span className="hidden sm:inline">
          {online
            ? `harness · ${MODEL_LABEL[health!.model] ?? health!.model}`
            : "harness offline"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[240px] border border-white/10 bg-[#06070b]/95 p-3 text-xs shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150">
          {online ? (
            <>
              <div className="mb-2 flex items-center justify-between border-b border-white/[0.08] pb-2">
                <span className="font-serif text-[15px] font-semibold text-[#e8edf5]">
                  {MODEL_LABEL[health!.model] ?? health!.model}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5ee3c0]">
                  running
                </span>
              </div>
              {health!.lastBriefAt && (
                <div className="mb-2 text-[#8a8a8f]">
                  last brief {timeAgo(health!.lastBriefAt)}
                </div>
              )}
              <div className="space-y-1 border-t border-white/[0.06] pt-2">
                {Object.entries(health!.sources).map(([name, state]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between text-[#9a9aa0]"
                  >
                    <span className="capitalize">{name}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          sourceStateStyles[state],
                        )}
                      />
                      {state}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[#9a9aa0]">
              Can&apos;t reach the harness at{" "}
              <span className="text-white">
                {process.env.NEXT_PUBLIC_HARNESS_URL ?? "localhost:8787"}
              </span>
              . Start the backend, then this turns green.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
