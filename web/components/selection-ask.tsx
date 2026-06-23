"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { BriefItem } from "@/lib/types";
import { matchItem } from "@/components/canvas/brief-view";

/**
 * Wraps a region; selecting text inside it pops a floating bar with "ask solo
 * about this" and — when the selection maps to a story — "open article".
 */
export function SelectionAsk({
  onAsk,
  items = [],
  children,
}: {
  onAsk: (text: string) => void;
  items?: BriefItem[];
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<{
    x: number;
    y: number;
    text: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    const onUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || text.length < 2 || text.length > 240 || !ref.current) {
        setPop(null);
        return;
      }
      const node = sel.anchorNode;
      if (!node || !ref.current.contains(node)) {
        setPop(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const match = matchItem(text, items);
      setPop({
        x: rect.left + rect.width / 2,
        y: rect.top,
        text,
        url: match?.url,
      });
    };
    const clear = () => setPop(null);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, [items]);

  return (
    <div ref={ref}>
      {children}
      {pop &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "fixed",
              left: pop.x,
              top: pop.y - 48,
              transform: "translateX(-50%)",
            }}
            className="z-[80] flex items-center gap-1 rounded-full border border-white/15 bg-[#0b0f17]/95 p-1 shadow-[0_8px_30px_-8px_rgba(20,136,252,0.6)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              onClick={() => {
                onAsk(pop.text);
                setPop(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-white transition-colors hover:bg-white/10"
            >
              <Sparkles className="size-3.5 text-[#7cc0ff]" />
              ask solo
            </button>
            {pop.url && (
              <>
                <span className="h-4 w-px bg-white/10" />
                <a
                  href={pop.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPop(null)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-[#9aa3b2] transition-colors hover:bg-white/10 hover:text-white"
                >
                  open article
                  <ArrowUpRight className="size-3.5" />
                </a>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
