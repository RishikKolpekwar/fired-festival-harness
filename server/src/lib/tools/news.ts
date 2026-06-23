// Material handling — Exa semantic news/web search.
import Exa from "exa-js";
import { nanoid } from "nanoid";
import { config, hasExa } from "../config.js";
import type { Signal, Tool } from "../harness/types.js";

const exa = hasExa() ? new Exa(config.exaApiKey) : null;

// Low-trust sources that cause fake "facts" (AI-simulated scores, prediction /
// betting articles, content farms, user-generated encyclopedias). Always excluded.
const EXCLUDE_DOMAINS = [
  "dimers.com", "oddsshark.com", "actionnetwork.com", "pickswise.com", "covers.com",
  "draftkings.com", "fanduel.com", "sportsbookwire.usatoday.com", "winnersandwhiners.com",
  "sportskeeda.com", "essentiallysports.com", "clutchpoints.com", "yardbarker.com",
  "sportsmockery.com", "fadeawayworld.net", "fandom.com", "quora.com", "pinterest.com",
  "answers.com", "msn.com", "aol.com", "examiner.com", "blogspot.com",
];

// Reputable outlets for HARD FACTS (scores, market moves). Used when trusted=true.
const TRUSTED_DOMAINS = [
  "apnews.com", "reuters.com", "bbc.com", "espn.com", "theathletic.com", "cbssports.com",
  "nbcsports.com", "skysports.com", "atptour.com", "wtatennis.com", "nba.com", "nfl.com",
  "fifa.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "nytimes.com",
];

export const searchNews: Tool<{ query: string; numResults?: number; trusted?: boolean }> = {
  name: "search_news",
  description:
    "Semantic web/news search via Exa. Use for AI infra, VC/startup, pathology AI, quant finance, sports, or any company/topic the user tracks. Returns recent articles. Low-trust sources (betting/prediction/simulation sites, content farms) are always filtered out. For HARD FACTS like sports scores or market moves, set trusted=true to restrict to major reputable outlets (AP, Reuters, ESPN, Bloomberg, official league sites).",
  parameters: {
    query: { type: "string", description: "What to search for", required: true },
    numResults: { type: "number", description: "How many results (default 6)" },
    trusted: { type: "boolean", description: "Restrict to major reputable outlets only. Use for scores, results, and market facts." },
  },
  effect: "read",
  async execute({ query, numResults = 6, trusted = false }) {
    if (!exa) {
      return { ok: false, data: null, error: "EXA_API_KEY not set", signals: [] };
    }
    try {
      const res = await exa.searchAndContents(query, {
        numResults,
        type: "auto",
        text: { maxCharacters: 3000 }, // richer body → real summaries, not just titles
        startPublishedDate: new Date(Date.now() - 14 * 86_400_000).toISOString(),
        excludeDomains: EXCLUDE_DOMAINS,
        ...(trusted ? { includeDomains: TRUSTED_DOMAINS } : {}),
      });
      const signals: Signal[] = res.results.map((r) => ({
        id: nanoid(10),
        source: "news",
        title: r.title ?? r.url,
        body: (r.text ?? "").slice(0, 3000),
        url: r.url,
        ts: r.publishedDate ?? new Date().toISOString(),
        meta: { author: r.author ?? undefined, score: r.score, image: (r as { image?: string }).image },
      }));
      return { ok: true, data: { count: signals.length }, error: null, signals, truncated: true };
    } catch (err) {
      return { ok: false, data: null, error: String(err), signals: [] };
    }
  },
};
