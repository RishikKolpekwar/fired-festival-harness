// FollowUps aggregator — solo-finder (c2bea) lane.
// Source adapters for the THREE sources this agent owns — the outreach pipeline
// (contacts), personal todos, and brief action items — plus the shared RANKING
// layer (stalenessDays / priority / column / suggestedAction + dedup).
// solo-builder's GET /api/followups merges these RawFollowUps with its own
// email/imessage/calendar adapters and runs rankFollowUps() over the union.
//
// Schema is orchestrator-LOCKED (FollowUpItem) — do not change shape unilaterally.
import { db } from "./db.js";
import { listContacts } from "./pipeline.js";
import { listTodos, localDateISO, extractTargetDate } from "./todos.js";
import type { ActionItem, Brief } from "./harness/types.js";

// Re-export so callers/tests that import it from here keep working; the canonical
// definition lives in todos.js (shared with the brief's todo gating).
export { extractTargetDate } from "./todos.js";

export type FollowUpChannel = "email" | "imessage" | "pipeline" | "todo" | "brief" | "calendar";
export type FollowUpColumn = "needs_you" | "awaiting_them" | "warm" | "scheduled" | "cold";

/** Canonical, orchestrator-locked shape served by GET /api/followups. */
export interface FollowUpItem {
  id: string;
  who: string;
  org?: string;
  channel: FollowUpChannel;
  pending: string;
  lastTouch?: string;
  stalenessDays: number;
  suggestedAction: string;
  priority: number; // 0-100
  column: FollowUpColumn;
  sourceRef?: string;
  entity?: string;
}

/** What a source adapter emits — the raw partial BEFORE the ranking layer derives
 *  stalenessDays/priority/column/suggestedAction. The hint fields let an adapter
 *  pass source-specific knowledge the ranking layer can't infer. */
export interface RawFollowUp {
  id: string;
  who: string;
  org?: string;
  channel: FollowUpChannel;
  pending: string;
  lastTouch?: string; // ISO; falls back to createdAt in the adapters
  sourceRef?: string;
  entity?: string;
  awaitingThem?: boolean; // we already reached out — ball is in their court
  owed?: boolean; // YOU owe the next move (a reply, the first outreach) → needs_you even if recent
  scheduledFor?: string; // YYYY-MM-DD of a future commitment (dated todo / meeting)
  done?: boolean; // closed loop → excluded from the board
  baseUrgency?: number; // 0-100 source hint (e.g. a KOL outranks a cold connection)
  suggestedAction?: string; // a crisp CTA the adapter already knows (overrides the generic one)
}

const DAY_MS = 86_400_000;

function entityFor(name?: string, kind: "person" | "project" = "person"): string | undefined {
  const slug = (name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `${kind}:${slug}` : undefined;
}

// ── SOURCE ADAPTERS (this agent's three sources) ─────────────────────────────

/** Outreach pipeline → follow-ups. 'to_reach_out' = you owe the first move;
 *  'contacted' = awaiting their reply; 'done' is excluded. */
export function pipelineFollowUps(): RawFollowUp[] {
  return listContacts()
    .filter((c) => c.status !== "done")
    .map((c) => ({
      id: `pipeline:${c.id}`,
      who: c.name,
      org: c.org,
      channel: "pipeline" as const,
      pending: c.nextAction ?? `reach out (${c.category ?? "contact"})`,
      lastTouch: c.lastTouch ?? c.createdAt,
      sourceRef: `contact:${c.id}`,
      entity: entityFor(c.name),
      awaitingThem: c.status === "contacted",
      owed: c.status === "to_reach_out" || c.status === "replied", // you owe the first move / a response
      baseUrgency: c.category === "KOL" ? 80 : c.category === "cofounder" ? 90 : c.category === "institution" ? 70 : 50,
    }));
}

/** Open personal todos → follow-ups. A dated todo is a scheduled commitment;
 *  an undated/overdue one is something you owe yourself. */
export function todoFollowUps(): RawFollowUp[] {
  return listTodos("open").map((t) => ({
    id: `todo:${t.id}`,
    who: t.title,
    channel: "todo" as const,
    pending: t.detail ?? t.title,
    lastTouch: t.createdAt,
    // Structured dueDate wins; otherwise pull a date out of the text ("... around June 20").
    scheduledFor: t.dueDate ?? extractTargetDate(`${t.title} ${t.detail ?? ""}`),
    sourceRef: `todo:${t.id}`,
    entity: t.tag ? entityFor(t.tag, "project") : undefined,
    owed: true, // a todo is on your plate (dated ones short-circuit to scheduled above)
    baseUrgency: 40,
  }));
}

/** Latest brief's action items → follow-ups (suggested outreach/applications the
 *  brief surfaced that you haven't acted on yet). Reads the briefs table directly
 *  so this stays decoupled from brief.ts internals. */
export function briefActionFollowUps(): RawFollowUp[] {
  const row = db.prepare(`SELECT payload, generated_at FROM briefs ORDER BY generated_at DESC LIMIT 1`).get() as
    | { payload: string; generated_at: string }
    | undefined;
  if (!row) return [];
  let brief: Brief;
  try {
    brief = JSON.parse(row.payload) as Brief;
  } catch {
    return [];
  }
  return (brief.actions ?? []).map((a: ActionItem) => {
    // `||` not `??` — a brief action's `who` can be an empty string.
    const who = a.who || a.org || "suggested follow-up";
    // A crisp imperative CTA from the action kind — NOT the (long) rationale,
    // which stays in `pending` as context.
    const cta =
      a.kind === "email" ? `draft an email to ${who}`
      : a.kind === "job" ? `apply: ${who}`
      : `follow up with ${who}`;
    return {
      id: `brief:${a.id}`,
      who,
      org: a.org,
      channel: "brief" as const,
      pending: a.reason,
      lastTouch: brief.generatedAt ?? row.generated_at,
      sourceRef: `brief-action:${a.id}`,
      entity: a.who ? entityFor(a.who) : undefined,
      // A confirmed/dated action (e.g. "friday 4pm is confirmed with neil") is a
      // scheduled commitment, not an open ask — pull a date from the rationale.
      scheduledFor: extractTargetDate(`${a.reason} ${a.who ?? ""}`),
      owed: true, // a surfaced action is something you haven't done yet (overridden by a future scheduledFor)
      suggestedAction: cta,
      baseUrgency: a.kind === "email" ? 75 : a.kind === "job" ? 65 : 55,
    };
  });
}

/** All raw follow-ups from the sources this agent owns. solo-builder concatenates
 *  these with its email/imessage/calendar adapters before ranking. */
export function ownedRawFollowUps(): RawFollowUp[] {
  return [...pipelineFollowUps(), ...todoFollowUps(), ...briefActionFollowUps()];
}

// ── RANKING LAYER (this agent owns; pure + testable) ─────────────────────────

/** Whole days since an ISO timestamp; 0 when unknown (don't penalize). */
export function stalenessDays(lastTouch: string | undefined, now: Date = new Date()): number {
  if (!lastTouch) return 0;
  const then = Date.parse(lastTouch);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

const COLUMN_BASE: Record<FollowUpColumn, number> = {
  needs_you: 70,
  scheduled: 50,
  awaiting_them: 45,
  warm: 30,
  cold: 12,
};

/** Which board column a raw item belongs in, from its hints + staleness. */
export function columnFor(raw: RawFollowUp, staleness: number, today: string): FollowUpColumn {
  if (raw.scheduledFor && raw.scheduledFor > today) return "scheduled";
  if (raw.awaitingThem) return "awaiting_them";
  if (raw.owed) return "needs_you"; // you owe the next move — never "warm" or "cold"
  if (staleness > 60) return "cold";
  if (raw.lastTouch && staleness <= 3) return "warm";
  return "needs_you";
}

/** 0-100 rank: column base + staleness pressure + source urgency, with cold
 *  clamped low so a stale dead lead never floats to the top. */
export function priorityFor(raw: RawFollowUp, staleness: number, column: FollowUpColumn): number {
  let p = COLUMN_BASE[column] + Math.min(staleness, 30);
  if (raw.baseUrgency) p += raw.baseUrgency * 0.15;
  if (column === "cold") p = Math.min(p, 25);
  return Math.max(0, Math.min(100, Math.round(p)));
}

/** The 1-tap next step, per channel + column. */
export function suggestedActionFor(raw: RawFollowUp, column: FollowUpColumn): string {
  if (column !== "scheduled" && raw.suggestedAction) return raw.suggestedAction; // adapter knows a crisp CTA
  if (column === "scheduled") {
    const by = raw.scheduledFor ? ` by ${raw.scheduledFor}` : "";
    // A dated todo is a task to DO; a meeting/person commitment is one to PREP for.
    return raw.channel === "todo" ? `do it${by}` : `prep for ${raw.who}${raw.scheduledFor ? ` (${raw.scheduledFor})` : ""}`;
  }
  if (column === "awaiting_them") return `send a nudge to ${raw.who}`;
  switch (raw.channel) {
    case "pipeline":
      return `draft an intro to ${raw.who}`;
    case "todo":
      return `knock out: ${raw.pending}`;
    case "brief":
      return `act on: ${raw.pending}`;
    case "email":
    case "imessage":
      return `reply to ${raw.who}`;
    default:
      return `follow up with ${raw.who}`;
  }
}

/** Merge → dedup → compute derived fields → rank. The endpoint calls this over
 *  the union of every adapter's raw items. Pure (except the injectable clock). */
const PERSON_CHANNELS = new Set<FollowUpChannel>(["pipeline", "brief", "email", "imessage"]);

export function rankFollowUps(raws: RawFollowUp[], now: Date = new Date()): FollowUpItem[] {
  const today = localDateISO(now);

  // Compute derived fields, then rank highest-priority first so that dedup keeps
  // the strongest representative of each loop.
  const ranked = raws
    .filter((r) => !r.done)
    .map((raw): FollowUpItem => {
      const staleness = stalenessDays(raw.lastTouch, now);
      const column = columnFor(raw, staleness, today);
      return {
        id: raw.id,
        who: raw.who,
        org: raw.org,
        channel: raw.channel,
        pending: raw.pending,
        lastTouch: raw.lastTouch,
        stalenessDays: staleness,
        suggestedAction: suggestedActionFor(raw, column),
        priority: priorityFor(raw, staleness, column),
        column,
        sourceRef: raw.sourceRef,
        entity: raw.entity,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  // Dedup: an exact source repeat, an identical open loop, OR the same PERSON
  // surfacing from multiple sources (e.g. a pipeline entry + a brief mention)
  // collapse to one — keeping the highest-priority instance (first, post-sort).
  const seen = new Set<string>();
  return ranked.filter((it) => {
    const keys = [
      `src:${it.channel}:${it.sourceRef ?? it.id}`,
      `loop:${it.who.toLowerCase()}|${(it.org ?? "").toLowerCase()}|${it.pending.toLowerCase()}`,
      ...(PERSON_CHANNELS.has(it.channel) ? [`person:${it.who.toLowerCase().trim()}`] : []),
    ];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

/** Convenience: ranked follow-ups from just this agent's sources (used by tests
 *  and as a standalone view; the real endpoint ranks the cross-source union). */
export function ownedFollowUps(now: Date = new Date()): FollowUpItem[] {
  return rankFollowUps(ownedRawFollowUps(), now);
}
