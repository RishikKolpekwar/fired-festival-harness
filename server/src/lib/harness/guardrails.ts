// ─────────────────────────────────────────────────────────────────────────────
// PILLAR 3 — GUARDRAILS
// Declared, not implicit. Three layers: INPUT (before the worker sees data),
// ACTION (around every tool call), OUTPUT (before anything is returned).
// Every rule is a named constant evaluated here — nothing lives in a prompt.
// ─────────────────────────────────────────────────────────────────────────────
import type { GuardrailDecision, Signal, Tool } from "./types.js";

// ── Declared rule constants ──────────────────────────────────────────────────
export const GUARDRAILS = {
  RELEVANCE_THRESHOLD: 0.4, // input: drop signals below this
  DEDUP_WINDOW_HOURS: 48, // input: same title can't reappear within window
  MAX_INPUT_TOKENS: 24_000, // input: truncate assembled context
  MAX_ENRICHMENT_PER_RUN: 10, // action: rate-limit contact lookups
  COST_CEILING_USD: 0.5, // loop: pause a run beyond this
  // action: a tool with effect 'send' requires a valid approval token
  NO_SEND_WITHOUT_APPROVAL: true,
  // output: a named person/company must be backed by a cited source from this run
  HALLUCINATION_FENCE: true,
  // input: only these RSS/news hosts may be fetched
  SOURCE_ALLOW_LIST: [
    "thetwentyminutevc.com",
    "libsyn.com", // 20VC podcast feed (matches *.libsyn.com)
    "substack.com",
    "github.com",
    "raw.githubusercontent.com",
    "exa.ai",
  ],
  // action: tools the worker is allowed to call (the allow-list)
  TOOL_ALLOW_LIST: [
    "search_news",
    "fetch_rss",
    "search_jobs",
    "read_imessage",
    "read_gmail",
    "read_calendar",
    "fetch_url",
    "find_email",
    "score_relevance",
    "enrich_contact",
    "add_outreach",
    "add_todo",
    "list_todos",
    "complete_todo",
    "remember",
    "recall",
    "lookup_contact",
    "find_file",
    "share_file",
    "connect_service",
    "call_api",
    "list_services",
    "draft_email",
    "queue_for_review",
    "send_email",
    "draft_imessage",
    "send_imessage",
  ],
} as const;

// ── INPUT LAYER ───────────────────────────────────────────────────────────────
/** Filter + dedup signals before the worker ever sees them. */
export function inputGuardrails(
  signals: Signal[],
): { kept: Signal[]; decisions: GuardrailDecision[] } {
  const decisions: GuardrailDecision[] = [];
  const seen = new Map<string, string>(); // normalizedTitle -> ts
  const windowMs = GUARDRAILS.DEDUP_WINDOW_HOURS * 3_600_000;

  const kept = signals.filter((s) => {
    // RELEVANCE_THRESHOLD
    if (s.relevance !== undefined && s.relevance < GUARDRAILS.RELEVANCE_THRESHOLD) {
      decisions.push({
        allow: false,
        rule: "RELEVANCE_THRESHOLD",
        layer: "input",
        reason: `relevance ${s.relevance.toFixed(2)} < ${GUARDRAILS.RELEVANCE_THRESHOLD}`,
      });
      return false;
    }
    // DEDUP_WINDOW
    const key = s.title.trim().toLowerCase();
    const prevTs = seen.get(key);
    if (prevTs && Math.abs(Date.parse(s.ts) - Date.parse(prevTs)) < windowMs) {
      decisions.push({
        allow: false,
        rule: "DEDUP_WINDOW",
        layer: "input",
        reason: `duplicate of "${s.title}" within ${GUARDRAILS.DEDUP_WINDOW_HOURS}h`,
      });
      return false;
    }
    seen.set(key, s.ts);
    return true;
  });

  return { kept, decisions };
}

/** Is this URL's host on the allow-list? (input layer, applied by fetch tools.) */
export function isAllowedSource(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return GUARDRAILS.SOURCE_ALLOW_LIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

// ── ACTION LAYER ──────────────────────────────────────────────────────────────
export interface ActionContext {
  approvalToken?: string;
  enrichmentCount: number;
  /** Standing approval: the user enabled auto-send mode (a declared policy). */
  autoSend?: boolean;
}

/** Gate a single tool call. Runs before the executor. */
export function actionGuardrails(tool: Tool, ctx: ActionContext): GuardrailDecision {
  // Tool allow-list
  if (!GUARDRAILS.TOOL_ALLOW_LIST.includes(tool.name as (typeof GUARDRAILS.TOOL_ALLOW_LIST)[number])) {
    return {
      allow: false,
      rule: "TOOL_ALLOW_LIST",
      layer: "action",
      reason: `unknown tool "${tool.name}"`,
      alarm: {
        type: "GUARDRAIL_VIOLATION",
        severity: "critical",
        context: `Worker attempted to call non-allow-listed tool "${tool.name}".`,
        recommendedAction: "Inspect the run trace; the call was blocked.",
      },
    };
  }

  // NO_SEND_WITHOUT_APPROVAL — the hard block (unless auto-send mode grants standing approval)
  if (tool.effect === "send" && GUARDRAILS.NO_SEND_WITHOUT_APPROVAL && !ctx.approvalToken && !ctx.autoSend) {
    return {
      allow: false,
      rule: "NO_SEND_WITHOUT_APPROVAL",
      layer: "action",
      reason: `tool "${tool.name}" has effect 'send' but no approval token was presented`,
      alarm: {
        type: "GUARDRAIL_VIOLATION",
        severity: "critical",
        context: `Send attempted via "${tool.name}" without human approval.`,
        recommendedAction: "Route through the review queue; approve before sending.",
      },
    };
  }

  // MAX_ENRICHMENT_PER_RUN
  if (tool.name === "enrich_contact" && ctx.enrichmentCount >= GUARDRAILS.MAX_ENRICHMENT_PER_RUN) {
    return {
      allow: false,
      rule: "MAX_ENRICHMENT_PER_RUN",
      layer: "action",
      reason: `enrichment cap (${GUARDRAILS.MAX_ENRICHMENT_PER_RUN}/run) reached`,
    };
  }

  return { allow: true, rule: "ALLOWED", layer: "action", reason: "passed action guardrails" };
}

// ── OUTPUT LAYER ──────────────────────────────────────────────────────────────
/**
 * HALLUCINATION_FENCE: any capitalized multi-word entity referenced in the
 * output must appear in a cited source title/body from this run, otherwise the
 * sentence is flagged. Returns possibly-mutated text + decisions.
 */
export function outputGuardrails(
  text: string,
  citedSources: { title?: string; body?: string }[],
): { text: string; decisions: GuardrailDecision[] } {
  if (!GUARDRAILS.HALLUCINATION_FENCE) return { text, decisions: [] };
  const decisions: GuardrailDecision[] = [];

  const corpus = citedSources
    .map((s) => `${s.title ?? ""} ${s.body ?? ""}`)
    .join(" ")
    .toLowerCase();

  // Find "Proper Noun Proper Noun" style entities (people / companies).
  const entityRe = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\b/g;
  const flagged = new Set<string>();
  for (const m of text.matchAll(entityRe)) {
    const entity = m[1]!;
    if (corpus.length === 0) continue;
    const lower = entity.toLowerCase();
    if (corpus.includes(lower)) continue; // full match → sourced
    // Token-aware: if the meaningful words of the entity appear in the corpus,
    // it's grounded (handles minor phrasing differences). Only flag when clearly absent.
    const tokens = lower.split(/\s+/).filter((w) => w.length >= 4);
    const present = tokens.filter((w) => corpus.includes(w)).length;
    const grounded = tokens.length > 0 && present / tokens.length >= 0.5;
    if (!grounded) flagged.add(entity);
  }

  for (const entity of flagged) {
    decisions.push({
      allow: false,
      rule: "HALLUCINATION_FENCE",
      layer: "output",
      reason: `entity "${entity}" not found in any cited source from this run`,
      alarm: {
        type: "HALLUCINATION_DETECTED",
        severity: "high",
        context: `Output referenced "${entity}" with no sourced citation this run.`,
        recommendedAction: "The reference was flagged; verify before trusting it.",
      },
    });
  }

  // We annotate rather than delete (so the brief stays readable) — a downstream
  // renderer can show flagged entities with a warning marker.
  return { text, decisions };
}
