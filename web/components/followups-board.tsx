"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import type { FollowUpColumn, FollowUpItem } from "@/lib/types";
import { api } from "@/lib/api";
import { LockBackdrop } from "@/components/lock-backdrop";
import { cn } from "@/lib/utils";

// Column order + editorial labels. Status accent is neon-ink only.
const COLUMNS: { key: FollowUpColumn; label: string; accent: string }[] = [
  { key: "needs_you", label: "needs you", accent: "#5ee3c0" },
  { key: "awaiting_them", label: "awaiting them", accent: "#7cc0ff" },
  { key: "warm", label: "warm", accent: "#ffd479" },
  { key: "scheduled", label: "scheduled", accent: "#a9b8ff" },
  { key: "cold", label: "cold", accent: "#6a7283" },
];

function staleLabel(item: FollowUpItem): string {
  if (item.stalenessDays <= 0) return "today";
  if (item.stalenessDays === 1) return "1 day";
  return `${item.stalenessDays} days`;
}

/** One follow-up — a hairline ledger entry, no card. Click opens the source
 * thread; the one-tap action drafts a reply in chat. */
function FollowUpRow({
  item,
  accent,
  onAct,
}: {
  item: FollowUpItem;
  accent: string;
  onAct?: (item: FollowUpItem) => void;
}) {
  return (
    <div className="relative border-b rule-hair py-3.5 pl-3">
      <span
        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
        style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
      />
      <div className="flex items-baseline justify-between gap-2">
        <a
          href={item.sourceRef || undefined}
          target={item.sourceRef ? "_blank" : undefined}
          rel="noopener noreferrer"
          className={cn(
            "truncate font-serif text-[16px] font-semibold text-[color:var(--ink)]",
            item.sourceRef &&
              "underline decoration-transparent underline-offset-4 hover:decoration-[color:var(--rule)]",
          )}
        >
          {item.who}
        </a>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-faint)]">
          {staleLabel(item)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-faint)]">
        <span style={{ color: accent }}>{item.channel}</span>
        {item.org && <span className="truncate normal-case tracking-normal font-serif text-[13px] italic">{item.org}</span>}
      </div>
      <p className="mt-1.5 font-serif text-[14px] leading-[1.5] text-[color:var(--ink-soft)]">
        {item.pending}
      </p>
      {item.suggestedAction && (
        <button
          type="button"
          onClick={() => onAct?.(item)}
          className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--link)] underline decoration-[color:var(--rule)] underline-offset-4 transition-opacity hover:opacity-70"
        >
          {item.suggestedAction} <ArrowUpRight className="size-3" />
        </button>
      )}
    </div>
  );
}

export function FollowUpsBoard({
  onAct,
  renderGraph,
}: {
  onAct?: (item: FollowUpItem) => void;
  // 54120663's relationship-graph view drops in here, fed the board's items so
  // there's one data source. Board is the primary view.
  renderGraph?: (items: FollowUpItem[]) => React.ReactNode;
}) {
  const [items, setItems] = useState<FollowUpItem[] | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"board" | "graph">("board");

  const load = useCallback(async () => {
    try {
      const { items } = await api.listFollowUps();
      setItems(items);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, state set after await (not a sync cascade)
    load();
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const byColumn = (col: FollowUpColumn) =>
    (items ?? [])
      .filter((i) => i.column === col)
      .sort((a, b) => b.priority - a.priority);

  const needsYou = byColumn("needs_you").length;

  return (
    <div className="broadsheet relative h-full overflow-hidden">
      <LockBackdrop />
      <div className="pointer-events-none absolute inset-0 bg-[#06070b]/55" />
      <div className="relative h-full overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full px-6 py-12 sm:px-10 lg:px-12"
        >
          {/* masthead */}
          <header className="mb-10">
            <div className="flex items-baseline justify-between border-b rule-hair pb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
              <span>the desk</span>
              <span>
                {needsYou} need{needsYou === 1 ? "s" : ""} you
              </span>
            </div>
            <div className="mt-6 flex items-end justify-between gap-4">
              <h1 className="font-serif text-[clamp(40px,8vw,72px)] font-semibold leading-[0.9] tracking-[-0.025em] text-[color:var(--ink)]">
                follow-ups
              </h1>
              <div className="mb-1 flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.16em]">
                <button
                  onClick={() => setView("board")}
                  className={cn(
                    "transition-colors",
                    view === "board"
                      ? "text-[color:var(--accent)]"
                      : "text-[color:var(--ink-faint)] hover:text-[color:var(--ink-soft)]",
                  )}
                >
                  board
                </button>
                <span className="text-[color:var(--ink-faint)]">/</span>
                <button
                  onClick={() => setView("graph")}
                  className={cn(
                    "transition-colors",
                    view === "graph"
                      ? "text-[color:var(--accent)]"
                      : "text-[color:var(--ink-faint)] hover:text-[color:var(--ink-soft)]",
                  )}
                >
                  graph
                </button>
              </div>
            </div>
          </header>

          {view === "graph" ? (
            renderGraph ? (
              renderGraph(items ?? [])
            ) : (
              <div className="flex min-h-[40vh] items-center justify-center border-t rule-hair pt-10 text-center">
                <p className="font-serif text-[16px] italic text-[color:var(--ink-faint)]">
                  relationship graph — coming online
                </p>
              </div>
            )
          ) : items === null && !error ? (
            <div className="flex items-center gap-2 py-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
              <Loader2 className="size-3.5 animate-spin" /> gathering your threads…
            </div>
          ) : error ? (
            <p className="border-t rule-hair py-10 font-serif text-[15px] italic text-red-400">
              couldn&apos;t reach the harness — start the backend and this fills in.
            </p>
          ) : (items?.length ?? 0) === 0 ? (
            <p className="border-t rule-hair py-10 font-serif text-[16px] italic text-[color:var(--ink-faint)]">
              nothing owed. inbox zero across every channel.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {COLUMNS.map((col) => {
                const colItems = byColumn(col.key);
                return (
                  <section key={col.key} className="min-w-0">
                    <h2
                      className="mb-1 flex items-baseline justify-between border-b pb-2 font-mono text-[10.5px] uppercase tracking-[0.2em]"
                      style={{ borderColor: col.accent, color: col.accent }}
                    >
                      <span>{col.label}</span>
                      <span className="text-[color:var(--ink-faint)]">
                        {colItems.length}
                      </span>
                    </h2>
                    {colItems.length === 0 ? (
                      <p className="py-3 font-serif text-[13px] italic text-[color:var(--ink-faint)]">
                        —
                      </p>
                    ) : (
                      colItems.map((item) => (
                        <FollowUpRow
                          key={item.id}
                          item={item}
                          accent={col.accent}
                          onAct={onAct}
                        />
                      ))
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
