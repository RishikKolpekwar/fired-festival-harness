// Material handling — internship/new-grad job postings from community GitHub
// boards (Simplify/pittcsc-style `listings.json`). Resilient: tries known feeds,
// filters to active + role-relevant, normalizes to Signals.
import { nanoid } from "nanoid";
import type { Signal, Tool } from "../harness/types.js";

// Well-known board listing files (raw JSON). Order = priority.
const BOARDS = [
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
  "https://raw.githubusercontent.com/vanshb03/Summer2026-Internships/dev/.github/scripts/listings.json",
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
];

// Roles relevant to the user's profile (AI/ML, quant, medical AI, infra).
const RELEVANT = /(machine learning|ml|ai|artificial intelligence|research|quant|infra|platform|backend|software|data|computer vision|nlp|llm|founding|health|medical|bio)/i;

interface Listing {
  company_name?: string;
  title?: string;
  locations?: string[];
  url?: string;
  date_posted?: number; // unix seconds
  active?: boolean;
  is_visible?: boolean;
}

export const searchJobs: Tool<{ keywords?: string; sinceDays?: number; max?: number }> = {
  name: "search_jobs",
  description:
    "Pull recent internship / new-grad postings from community GitHub job boards (Simplify/pittcsc style). Filters to AI/ML, quant, infra, and medical-AI roles relevant to the user. Use when the user asks about jobs/recruiting or for the morning brief's action queue.",
  parameters: {
    keywords: { type: "string", description: "Extra keyword filter (optional)" },
    sinceDays: { type: "number", description: "Only postings newer than N days (default 7)" },
    max: { type: "number", description: "Max postings to return (default 15)" },
  },
  effect: "read",
  async execute({ keywords, sinceDays = 7, max = 15 }) {
    const cutoff = Date.now() / 1000 - sinceDays * 86_400;
    const extra = keywords ? new RegExp(keywords, "i") : null;

    for (const board of BOARDS) {
      try {
        const resp = await fetch(board, { signal: AbortSignal.timeout(10_000) });
        if (!resp.ok) continue;
        const listings = (await resp.json()) as Listing[];
        const signals: Signal[] = [];
        for (const l of listings) {
          if (l.active === false || l.is_visible === false) continue;
          if (l.date_posted && l.date_posted < cutoff) continue;
          const title = l.title ?? "";
          if (!RELEVANT.test(title)) continue;
          if (extra && !extra.test(`${title} ${l.company_name ?? ""}`)) continue;
          signals.push({
            id: nanoid(10),
            source: "jobs",
            title: `${l.title} @ ${l.company_name}`,
            body: `${l.company_name} — ${(l.locations ?? []).join(", ") || "location n/a"}`,
            url: l.url,
            ts: l.date_posted ? new Date(l.date_posted * 1000).toISOString() : new Date().toISOString(),
            meta: { company: l.company_name },
          });
          if (signals.length >= max) break;
        }
        return { ok: true, data: { board, count: signals.length }, error: null, signals };
      } catch {
        // try next board
      }
    }
    return { ok: false, data: null, error: "all job boards unreachable", signals: [] };
  },
};
