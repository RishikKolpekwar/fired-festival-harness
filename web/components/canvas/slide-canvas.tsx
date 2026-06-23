"use client";

import { useEffect } from "react";
import { Layers, X } from "lucide-react";
import type { CanvasState } from "@/hooks/use-harness";
import { BriefView } from "./brief-view";
import { cn } from "@/lib/utils";

/**
 * Model "B": dense artifacts render in a slide-out panel, never as chat bubbles.
 * Opens when the harness emits a `canvas` SSE event.
 */
export function SlideCanvas({
  canvas,
  onClose,
  onApprove,
}: {
  canvas: CanvasState;
  onClose: () => void;
  onApprove?: (id: string) => Promise<boolean>;
}) {
  // Close on Escape.
  useEffect(() => {
    if (!canvas.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canvas.open, onClose]);

  return (
    <>
      {/* scrim */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:bg-black/30",
          canvas.open
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      {/* panel */}
      <aside
        className={cn(
          "glass-strong fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col border-y-0 border-r-0 shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          canvas.open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!canvas.open}
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-medium text-[#c4c4ca]">
            <Layers className="size-4 text-[#1488fc]" />
            Canvas
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#8a8a8f]">
              {canvas.kind}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-[#8a8a8f] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {canvas.kind === "brief" && canvas.brief ? (
            <BriefView brief={canvas.brief} onApprove={onApprove} />
          ) : canvas.kind === "pipeline" ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-[#6a6a6f]">
              <Layers className="mb-3 size-8 opacity-40" />
              Outbound pipeline view — reserved for phase 2.
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[#6a6a6f]">
              Nothing to show yet.
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
