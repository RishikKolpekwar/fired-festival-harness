"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { RotateCw } from "lucide-react";
import type { Brief } from "@/lib/types";
import { BriefView, ActionCard, normalizeBrief } from "@/components/canvas/brief-view";
import { LockBackdrop } from "@/components/lock-backdrop";
import { SelectionAsk } from "@/components/selection-ask";

function greetingFor(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
}

/** The Brief tab — a warm-paper broadsheet. Editorial nameplate masthead, then
 * the morning read (drop-cap lede + stories under hairline rules), a "what needs
 * you" action ledger, and a sources colophon. The dark+neon language is reserved
 * for the splash / hero; this surface is ink-on-paper. */
export function BriefPage({
  brief,
  onApprove,
  onRegenerate,
  onAskAbout,
  streaming,
}: {
  brief: Brief;
  onApprove?: (id: string) => Promise<boolean>;
  onRegenerate?: () => void;
  onAskAbout?: (text: string) => void;
  streaming?: boolean;
}) {
  const { total, flat } = normalizeBrief(brief);
  const actions = brief.actions ?? [];
  const citedSources = brief.citedSources ?? [];

  // Deferred to the client on mount: greeting + locale date depend on the
  // viewer's wall clock, so computing them during render would mismatch SSR.
  const [meta, setMeta] = useState({ greeting: "good morning", date: "" });
  useEffect(() => {
    const now = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional client-only hydration of time/locale
    setMeta({
      greeting: greetingFor(now),
      date: now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    });
  }, []);

  return (
    <div className="broadsheet relative h-full overflow-hidden">
      {/* shared lock-screen / chat backdrop, scoped to the brief surface */}
      <LockBackdrop />
      {/* reading scrim — keeps the plasma but darkens it under dense serif text */}
      <div className="pointer-events-none absolute inset-0 bg-[#06070b]/55" />
      <div className="relative h-full overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full px-6 py-12 sm:px-10 lg:px-12"
        >
        {/* masthead — the night-edition nameplate */}
        <header className="mb-12">
          <div className="flex items-baseline justify-between border-b rule-hair pb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            <span>{meta.greeting}, rishik</span>
            <span>{meta.date}</span>
          </div>
          <h1 className="mt-6 text-center font-serif text-[clamp(52px,11vw,104px)] font-semibold leading-[0.86] tracking-[-0.03em] text-[color:var(--ink)]">
            s01o
          </h1>
          <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.42em] text-[color:var(--accent)]">
            the morning edition
          </p>
          <div className="mt-6 flex items-center justify-between gap-4 border-y-[3px] border-double border-[color:var(--rule)] py-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
              {total} {total === 1 ? "story" : "stories"} · {actions.length} need you ·{" "}
              {citedSources.length} {citedSources.length === 1 ? "source" : "sources"}
            </span>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                disabled={streaming}
                className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--accent)] underline decoration-[color:var(--accent)] underline-offset-4 transition-opacity hover:opacity-70 disabled:opacity-40"
              >
                <RotateCw className={streaming ? "size-3.5 animate-spin" : "size-3.5"} />
                refresh
              </button>
            )}
          </div>
        </header>

        {/* the morning read — select any phrase to ask solo about it */}
        {onAskAbout ? (
          <SelectionAsk onAsk={onAskAbout} items={flat}>
            <BriefView brief={brief} variant="page" onApprove={onApprove} />
          </SelectionAsk>
        ) : (
          <BriefView brief={brief} variant="page" onApprove={onApprove} />
        )}

        {/* what needs you — an action ledger, drafts queued for review */}
        {actions.length > 0 && (
          <section className="mt-16">
            <h3 className="kicker mb-1 block border-b border-[color:var(--ink-faint)] pb-2">
              what needs you
            </h3>
            <p className="mb-1 font-serif text-[14px] italic leading-relaxed text-[color:var(--ink-faint)]">
              drafts queue for review. nothing sends without you.
            </p>
            <div>
              {actions.map((a) => (
                <ActionCard key={a.id} action={a} surface="paper" onApprove={onApprove} />
              ))}
            </div>
          </section>
        )}

        {/* sources colophon */}
        {citedSources.length > 0 && (
          <section className="mt-14 border-t border-[color:var(--ink-faint)] pt-3">
            <h3 className="kicker mb-2">sources</h3>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] text-[color:var(--ink-soft)]">
              {citedSources.map((s) =>
                s.url ? (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-[color:var(--rule)] underline-offset-4 transition-colors hover:text-[color:var(--accent)] hover:decoration-[color:var(--accent)]"
                  >
                    {s.source}
                  </a>
                ) : (
                  <span key={s.id}>{s.source}</span>
                ),
              )}
            </div>
          </section>
        )}
        </motion.div>
      </div>
    </div>
  );
}
