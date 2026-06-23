"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Briefcase,
  Check,
  Loader2,
  Mail,
  Pencil,
  RotateCcw,
} from "lucide-react";
import type { ActionItem, Brief, BriefItem, BriefSection, BriefTodo } from "@/lib/types";
import { api } from "@/lib/api";
import { BriefArt } from "@/components/brief-art";
import { cn, timeAgo } from "@/lib/utils";

const actionIcon = {
  email: Mail,
  job: Briefcase,
  follow_up: RotateCcw,
} as const;

function domainOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** "2026-06-20" → "jun 20" (lowercase). Parsed as a local date so the day
 * doesn't drift across timezones. */
function fmtDue(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toLowerCase();
}

type Tone = "default" | "accent" | "amber" | "teal";
const toneClass: Record<Tone, string> = {
  default: "bg-white/[0.04] text-[#9aa3b2] ring-white/10",
  accent: "bg-[#1488fc]/10 text-[#7cc0ff] ring-[#1488fc]/25",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  teal: "bg-[#5ee3c0]/10 text-[#5ee3c0] ring-[#5ee3c0]/25",
};

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] tracking-wide ring-1 ring-inset",
        toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Panel (canvas) article row — compact text list. */
function ArticleRow({ item }: { item: BriefItem }) {
  const dom = domainOf(item.url);
  return (
    <a
      href={item.url || undefined}
      target={item.url ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="group block border-b border-white/[0.05] py-4 first:pt-0 last:border-0"
    >
      <h4 className="font-display text-[15px] font-semibold leading-snug tracking-tight text-white transition-colors group-hover:text-[#9fc2ff]">
        {item.title}
      </h4>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {dom && <Badge>{dom}</Badge>}
        {item.flagged && <Badge tone="amber">verify</Badge>}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#9aa3b2]">
        {item.summary}
      </p>
    </a>
  );
}

export function ActionCard({
  action,
  surface = "dark",
}: {
  action: ActionItem;
  // onApprove kept for back-compat with callers; execution now goes through
  // /api/actions/execute (brief actions have no draft id to approve).
  onApprove?: (id: string) => Promise<boolean>;
  surface?: "dark" | "paper";
}) {
  const Icon = actionIcon[action.kind];
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<{ status?: string; note?: string }>({});
  // editable draft — the user can tweak the message before sending, no Gmail round-trip
  const [draft, setDraft] = useState(action.draftOpener ?? "");
  const [subj, setSubj] = useState(action.subject ?? "");
  const [expanded, setExpanded] = useState(false);
  const isEmail = action.kind === "email";
  // default the one-pager ON for MedMorphIQ-related outreach, OFF otherwise —
  // always flippable. backend's explicit toggle overrides its own heuristic.
  const mmRelated = /medmorphiq|patholog|ihc|er\/pr|ki-?67|biomarker|histo/i.test(
    [action.org, action.reason, action.draftOpener, action.who]
      .filter(Boolean)
      .join(" "),
  );
  const [attachOnePager, setAttachOnePager] = useState(mmRelated);

  const canSend =
    (action.kind === "email" || action.kind === "follow_up") &&
    !!action.who &&
    !!action.draftOpener;
  const sendDisabled = state === "loading" || state === "done" || (canSend && !draft.trim());
  // A job link, or an outreach reminder that only carries a profile link.
  const canOpen = !!action.url && !canSend;
  const showButton = canSend || canOpen;
  const openLabel = action.kind === "job" ? "apply" : "open";

  const handleExecute = async () => {
    setState("loading");
    try {
      if (canOpen) {
        window.open(action.url!, "_blank", "noopener,noreferrer");
        setState("done");
        return;
      }
      const res = await api.executeAction({
        kind: action.kind,
        who: action.who,
        org: action.org,
        orgDomain: action.orgDomain,
        subject: isEmail ? subj : undefined, // send the edited subject for emails
        body: draft, // send the edited text, not the original draft
        attachOnePager: isEmail ? attachOnePager : undefined,
        url: action.url,
      });
      // res.error carries either the draft-fallback note (ok:true, status
      // "draft" — cold contact, no saved email) or the real failure reason
      // (ok:false). Surface it either way instead of a bare "retry".
      setResult({ status: res.status, note: res.error });
      setState(res.ok ? "done" : "error");
    } catch {
      setResult({
        note:
          "couldn't reach the harness at " +
          (process.env.NEXT_PUBLIC_HARNESS_URL ?? "localhost:8787"),
      });
      setState("error");
    }
  };

  const buttonLabel =
    state === "done"
      ? canOpen
        ? "opened"
        : result.status === "draft"
          ? "drafted"
          : "sent"
      : state === "error"
        ? "retry"
        : canOpen
          ? openLabel
          : "send";

  // Paper surface — a hairline ledger entry, no card. Used in the broadsheet brief.
  if (surface === "paper") {
    return (
      <div className="border-b rule-hair py-4 first:border-t">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {action.who && (
            <span className="font-serif text-[18px] font-semibold text-[color:var(--ink)]">
              {action.who}
            </span>
          )}
          <span className="kicker">{action.kind.replace("_", " ")}</span>
          {action.org && (
            <span className="font-serif text-[14px] italic text-[color:var(--ink-faint)]">
              {action.org}
            </span>
          )}
        </div>
        <p className="mt-1 font-serif text-[15.5px] leading-[1.55] text-[color:var(--ink-soft)]">
          {action.reason}
        </p>
        {action.draftOpener && state !== "done" && (
          <div className="mt-2.5">
            {expanded ? (
              <div className="border-l-2 pl-4" style={{ borderColor: "var(--accent)" }}>
                {isEmail && (
                  <div className="mb-1.5 flex items-baseline gap-2 border-b rule-hair pb-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
                      to
                    </span>
                    <span className="font-serif text-[14px] text-[color:var(--ink-soft)]">
                      {action.who}
                      {action.email
                        ? ` · ${action.email}`
                        : action.org
                          ? ` · ${action.org}`
                          : ""}
                    </span>
                  </div>
                )}
                {isEmail && (
                  <div className="mb-1.5 flex items-baseline gap-2 border-b rule-hair pb-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
                      subject
                    </span>
                    <input
                      value={subj}
                      onChange={(e) => setSubj(e.target.value)}
                      className="flex-1 bg-transparent font-serif text-[15px] font-semibold text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
                      placeholder="subject…"
                    />
                  </div>
                )}
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.min(16, Math.max(5, draft.split("\n").length + 1))}
                  className="w-full resize-y bg-transparent font-serif text-[15px] leading-relaxed text-[color:var(--ink)] outline-none"
                  placeholder="write your message… (greeting, body, sign-off)"
                />
                {isEmail && (
                  <div className="mt-2 flex items-center gap-2 border-t rule-hair pt-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
                      medmorphiq one-pager
                    </span>
                    <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
                      <button
                        type="button"
                        onClick={() => setAttachOnePager(true)}
                        className={cn(
                          "transition-colors",
                          attachOnePager
                            ? "text-[color:var(--accent)]"
                            : "text-[color:var(--ink-faint)] hover:text-[color:var(--ink-soft)]",
                        )}
                      >
                        attach
                      </button>
                      <span className="text-[color:var(--ink-faint)]">/</span>
                      <button
                        type="button"
                        onClick={() => setAttachOnePager(false)}
                        className={cn(
                          "transition-colors",
                          !attachOnePager
                            ? "text-[color:var(--accent)]"
                            : "text-[color:var(--ink-faint)] hover:text-[color:var(--ink-soft)]",
                        )}
                      >
                        skip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="group block w-full text-left"
              >
                <span
                  className="block border-l-2 pl-4 font-serif text-[15px] italic leading-relaxed text-[color:var(--ink-soft)] line-clamp-2"
                  style={{ borderColor: "var(--rule)" }}
                >
                  “{draft}”
                </span>
                <span className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)] group-hover:text-[color:var(--accent)]">
                  <Pencil className="size-3" /> tap to expand and edit
                </span>
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          {action.suggestedChannel && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
              via {action.suggestedChannel}
            </span>
          )}
          {showButton && (
            <button
              onClick={handleExecute}
              disabled={sendDisabled}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-40",
                state === "done"
                  ? "text-[color:var(--ink-faint)]"
                  : "text-[color:var(--accent)] underline decoration-[color:var(--accent)] underline-offset-4 hover:opacity-70",
              )}
            >
              {state === "loading" && <Loader2 className="size-3 animate-spin" />}
              {state === "done" && <Check className="size-3" />}
              {buttonLabel}
            </button>
          )}
        </div>
        {result.note && (
          <p
            className={cn(
              "mt-2 font-serif text-[13.5px] italic leading-relaxed",
              state === "error" ? "text-red-400" : "text-[color:var(--accent)]",
            )}
          >
            {result.note}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 transition-all duration-200 hover:border-[#1488fc]/30 hover:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#1488fc]/12 ring-1 ring-[#1488fc]/25">
          <Icon className="size-4 text-[#7cc0ff]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {action.who && (
              <span className="font-display text-[14px] font-semibold tracking-tight text-white">
                {action.who}
              </span>
            )}
            <Badge tone="accent">{action.kind.replace("_", " ")}</Badge>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#b4b4ba]">
            {action.reason}
          </p>
          {action.draftOpener && state !== "done" && (
            <div className="mt-2.5">
              {expanded ? (
                <div className="space-y-1.5">
                  {isEmail && (
                    <input
                      value={subj}
                      onChange={(e) => setSubj(e.target.value)}
                      className="w-full rounded-lg border border-[#1488fc]/30 bg-[#0a1422] px-3 py-2 text-[12.5px] font-medium text-[#dfe6f0] outline-none focus:border-[#1488fc]/60"
                      placeholder="subject…"
                    />
                  )}
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={Math.min(14, Math.max(4, draft.split("\n").length + 1))}
                    className="w-full resize-y rounded-lg border border-[#1488fc]/30 bg-[#0a1422] px-3 py-2 text-[12.5px] leading-relaxed text-[#dfe6f0] outline-none focus:border-[#1488fc]/60"
                    placeholder="write your message…"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="group block w-full text-left"
                >
                  <span className="block rounded-lg border-l-2 border-[#1488fc]/40 bg-[#1488fc]/[0.06] px-3 py-2 text-[12.5px] italic leading-relaxed text-[#c4cad6] line-clamp-2 group-hover:bg-[#1488fc]/[0.1]">
                    “{draft}”
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] tracking-wide text-[#6a8fb8] group-hover:text-[#7cc0ff]">
                    <Pencil className="size-3" /> tap to expand and edit
                  </span>
                </button>
              )}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            {action.suggestedChannel && (
              <span className="font-mono text-[10px] tracking-wide text-[#6a6a6f]">
                via {action.suggestedChannel}
              </span>
            )}
            {showButton && (
              <button
                onClick={handleExecute}
                disabled={sendDisabled}
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-all active:scale-95",
                  state === "done"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : state === "error"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-gradient-to-b from-[#3a9bff] to-[#1271f0] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_20px_-6px_rgba(20,136,252,0.6)] hover:from-[#4aa6ff] hover:to-[#1a7bff] disabled:opacity-50",
                )}
              >
                {state === "loading" && <Loader2 className="size-3 animate-spin" />}
                {state === "done" && <Check className="size-3" />}
                {buttonLabel}
              </button>
            )}
          </div>
          {result.note && (
            <p
              className={cn(
                "mt-2 text-[11.5px] leading-relaxed",
                state === "error" ? "text-red-300" : "text-amber-300/80",
              )}
            >
              {result.note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Group a flat items[] by sourceTag, preserving first-seen order. */
function groupByTag(items: BriefItem[]): BriefSection[] {
  const order: string[] = [];
  const map = new Map<string, BriefItem[]>();
  for (const it of items) {
    const tag = (it.sourceTag || "today").trim();
    if (!map.has(tag)) {
      map.set(tag, []);
      order.push(tag);
    }
    map.get(tag)!.push(it);
  }
  return order.map((heading) => ({ heading, items: map.get(heading)! }));
}

/** Normalize either brief shape (legacy sections[] or new flat items[]). */
export function normalizeBrief(brief: Brief): {
  topline?: string;
  groups: BriefSection[];
  flat: BriefItem[];
  lead?: BriefItem;
  total: number;
} {
  const groups =
    brief.sections && brief.sections.length
      ? brief.sections.map((s) => ({ heading: s.heading, items: s.items ?? [] }))
      : groupByTag(brief.items ?? []);
  // keep the backend's original (curated) order for the read
  const flat =
    brief.items && brief.items.length
      ? brief.items
      : (brief.sections ?? []).flatMap((s) => s.items ?? []);
  const lead = flat.length
    ? [...flat].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
    : undefined;
  return { topline: brief.topline, groups, flat, lead, total: flat.length };
}

/** Find the brief item a selected phrase most likely refers to. */
export function matchItem(text: string, items: BriefItem[]): BriefItem | null {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  if (!words.length) return null;
  let best: BriefItem | null = null;
  let bestScore = 0;
  for (const it of items) {
    const hay = `${it.title} ${it.summary} ${it.whyItMatters ?? ""}`.toLowerCase();
    let s = 0;
    for (const w of words) if (hay.includes(w)) s++;
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  return bestScore >= Math.min(2, words.length) ? best : null;
}

/** Open personal todos, resurfaced in the brief until checked off. Dark for the
 * canvas panel; a hairline ledger ("on your plate") on the paper brief. */
function TodoList({
  todos,
  surface = "dark",
}: {
  todos: BriefTodo[];
  surface?: "dark" | "paper";
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const complete = async (id: string) => {
    setBusy(id);
    try {
      const res = await api.completeTodo(id);
      if (res.ok) setDone((d) => new Set(d).add(id));
    } catch {
      /* leave it visible; user can retry */
    } finally {
      setBusy(null);
    }
  };

  if (surface === "paper") {
    return (
      <section>
        <h3 className="kicker mb-1 block border-b border-[color:var(--ink-faint)] pb-2">
          on your plate
        </h3>
        <div>
          {todos.map((t) => {
            const checked = done.has(t.id);
            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-start gap-3 border-b rule-hair py-3 transition-opacity",
                  checked && "opacity-40",
                )}
              >
                <button
                  onClick={() => !checked && complete(t.id)}
                  disabled={checked || busy === t.id}
                  aria-label="mark done"
                  className={cn(
                    "mt-0.5 flex size-[18px] flex-shrink-0 items-center justify-center rounded-full border transition-colors",
                    checked
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--paper)]"
                      : "border-[color:var(--ink-faint)] text-transparent hover:border-[color:var(--accent)]",
                  )}
                >
                  {busy === t.id ? (
                    <Loader2 className="size-3 animate-spin text-[color:var(--accent)]" />
                  ) : (
                    <Check className="size-3" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-serif text-[16px] leading-snug text-[color:var(--ink)]",
                      checked && "line-through",
                    )}
                  >
                    {t.title}
                  </p>
                  {t.detail && (
                    <p className="mt-0.5 font-serif text-[14px] italic leading-relaxed text-[color:var(--ink-soft)]">
                      {t.detail}
                    </p>
                  )}
                  {t.dueDate && (
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--accent)]">
                      due {fmtDue(t.dueDate)}
                    </span>
                  )}
                </div>
                {t.tag && (
                  <span className="kicker mt-1 text-[color:var(--ink-faint)]">
                    {t.tag}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight text-white">
        <span className="size-1.5 rounded-full bg-amber-400" />
        on your plate
      </h3>
      <div className="space-y-2">
        {todos.map((t) => {
          const checked = done.has(t.id);
          return (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 transition-opacity",
                checked && "opacity-40",
              )}
            >
              <button
                onClick={() => !checked && complete(t.id)}
                disabled={checked || busy === t.id}
                aria-label="mark done"
                className={cn(
                  "mt-0.5 flex size-[18px] flex-shrink-0 items-center justify-center rounded-full border transition-colors",
                  checked
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                    : "border-white/25 text-transparent hover:border-amber-400/70",
                )}
              >
                {busy === t.id ? (
                  <Loader2 className="size-3 animate-spin text-amber-300" />
                ) : (
                  <Check className="size-3" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[14px] leading-snug text-[#e3e7ee]",
                    checked && "line-through",
                  )}
                >
                  {t.title}
                </p>
                {t.detail && (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#9aa3b2]">
                    {t.detail}
                  </p>
                )}
              </div>
              {t.tag && <Badge tone="amber">{t.tag}</Badge>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The opening standfirst — the topline as a drop-cap editorial lede, set
 * across columns like a printed front page. */
function Lede({ text }: { text: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="drop-cap mb-10 border-b rule-hair pb-10 text-[22px] font-normal leading-[1.5] text-[#c4ccd8] sm:text-[26px] lg:text-[28px]"
    >
      {text}
    </motion.p>
  );
}

/** One story in the broadsheet: small-caps kicker, serif headline, prose, and a
 * "why this matters to you" pull. No cards — pure editorial typography on paper,
 * separated by hairline rules. The lead story runs bigger and sets its body in
 * two columns like a front-page feature. */
function ArticleSection({
  item,
  lead,
}: {
  item: BriefItem;
  lead?: boolean;
}) {
  const dom = domainOf(item.url);
  return (
    <article className={cn("story", lead ? "mb-9" : "mb-8")}>
      {/* article cut (drop-in from brief-art.tsx) — returns null when no image,
          so image-less stories stay pure typography. */}
      <BriefArt item={item} variant="page" lead={lead} className="mb-3" />
      <h2
        className={cn(
          "font-serif font-semibold tracking-[-0.01em] text-[color:var(--ink)]",
          lead
            ? "text-[27px] leading-[1.1] sm:text-[32px]"
            : "text-[21px] leading-[1.18] sm:text-[23px]",
        )}
      >
        {item.title}
      </h2>

      <p
        className={cn(
          "mt-2 leading-[1.72] text-[color:var(--ink-soft)]",
          lead ? "text-[16.5px]" : "text-[15.5px]",
        )}
      >
        <span className="kicker mr-2">
          {item.sourceTag}
          {item.flagged ? " · verify" : ""}
        </span>
        {item.summary}
      </p>

      {item.whyItMatters && (
        <p
          className={cn(
            "mt-2.5 border-l-2 pl-3.5 italic leading-[1.55] text-[color:var(--ink)]",
            lead ? "text-[15.5px]" : "text-[14.5px]",
          )}
          style={{ borderColor: "var(--accent)" }}
        >
          <span className="kicker mr-2 not-italic">why it matters</span>
          {item.whyItMatters}
        </p>
      )}

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--link)] underline decoration-[color:var(--rule)] underline-offset-4 transition-colors hover:opacity-70"
        >
          {dom ? `read at ${dom}` : "read the full story"} <span aria-hidden>↗</span>
        </a>
      )}
    </article>
  );
}

export function BriefView({
  brief,
  onApprove,
  variant = "panel",
}: {
  brief: Brief;
  onApprove?: (id: string) => Promise<boolean>;
  variant?: "panel" | "page";
}) {
  const { groups, flat, topline } = normalizeBrief(brief);
  const actions = brief.actions ?? [];
  const todos = brief.todos ?? [];

  // The brief — a warm-paper broadsheet: a drop-cap editorial lede, then stories
  // flowing top-to-bottom under hairline rules (small-caps kicker + serif
  // headline + prose + a "why it matters to you" pull), and a closing agenda
  // ledger. One authored read, no cards.
  if (variant === "page") {
    return (
      <div>
        {topline && <Lede text={topline} />}
        <div className="river">
          {flat.map((item, i) => (
            <ArticleSection key={i} item={item} lead={i === 0} />
          ))}
        </div>
        {todos.length > 0 && (
          <div className="mt-12 border-t rule-hair pt-8">
            <TodoList todos={todos} surface="paper" />
          </div>
        )}
      </div>
    );
  }

  // panel (slide-out canvas)
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#7cc0ff]">
          <span className="size-1.5 rounded-full bg-[#7cc0ff]" />
          Morning Brief
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">
          Here&apos;s what needs you today
        </h2>
        <p className="mt-1 font-mono text-[11px] tracking-wide text-[#6a6a6f]">
          generated {timeAgo(brief.generatedAt)} · {brief.actions.length} action
          {brief.actions.length === 1 ? "" : "s"}
        </p>
      </div>

      {actions.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight text-white">
            <span className="size-1.5 rounded-full bg-[#5ee3c0]" />
            who to reach out to
          </h3>
          <div className="space-y-2.5">
            {actions.map((a) => (
              <ActionCard key={a.id} action={a} onApprove={onApprove} />
            ))}
          </div>
        </section>
      )}

      {todos.length > 0 && <TodoList todos={todos} />}

      {groups.map((section, si) => (
        <section key={si}>
          <div className="mb-1 flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#7cc0ff]">
              {section.heading}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#7cc0ff]/25 to-transparent" />
          </div>
          <div>
            {(section.items ?? []).map((item, ii) => (
              <ArticleRow key={ii} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
