// Material handling — RSS (20VC episodes + Substack follows).
import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { isAllowedSource } from "../harness/guardrails.js";
import type { Signal, Tool } from "../harness/types.js";

const parser = new Parser({ timeout: 10_000 });

// Curated default feeds. The user can extend this (TODO in profile).
export const DEFAULT_FEEDS = [
  "https://thetwentyminutevc.libsyn.com/rss", // 20VC podcast
];

export const fetchRss: Tool<{ feeds?: string[]; sinceHours?: number }> = {
  name: "fetch_rss",
  description:
    "Fetch recent items from curated RSS feeds (20VC podcast episodes, Substack writers the user follows). Use to surface new episodes/posts.",
  parameters: {
    feeds: { type: "array", description: "Feed URLs (defaults to the curated set)" },
    sinceHours: { type: "number", description: "Only items newer than this many hours (default 168)" },
  },
  effect: "read",
  async execute({ feeds = DEFAULT_FEEDS, sinceHours = 168 }) {
    const cutoff = Date.now() - sinceHours * 3_600_000;
    const signals: Signal[] = [];
    const failures: string[] = [];

    for (const url of feeds) {
      // SOURCE_ALLOW_LIST (input layer) — applied at the fetch boundary.
      if (!isAllowedSource(url)) {
        failures.push(`${url} (not on allow-list)`);
        continue;
      }
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items) {
          const ts = item.isoDate ?? item.pubDate ?? new Date().toISOString();
          if (Date.parse(ts) < cutoff) continue;
          signals.push({
            id: nanoid(10),
            source: "rss",
            title: item.title ?? "(untitled)",
            body: (item.contentSnippet ?? item.content ?? "").slice(0, 1000),
            url: item.link,
            ts,
            meta: { feed: feed.title },
          });
        }
      } catch (err) {
        failures.push(`${url} (${String(err).slice(0, 80)})`);
      }
    }

    const ok = signals.length > 0 || failures.length === 0;
    return {
      ok,
      data: { count: signals.length, failures },
      error: ok ? null : `all feeds failed: ${failures.join("; ")}`,
      signals,
    };
  },
};
