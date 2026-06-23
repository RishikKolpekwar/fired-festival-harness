// Material handling — fetch the readable text of a web page (job description,
// article, etc.) so a scout can summarize or tailor an application to it.
import Exa from "exa-js";
import { nanoid } from "nanoid";
import { config, hasExa } from "../config.js";
import type { Signal, Tool } from "../harness/types.js";

const exa = hasExa() ? new Exa(config.exaApiKey) : null;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const fetchUrl: Tool<{ url: string }> = {
  name: "fetch_url",
  description:
    "Fetch the readable text of a web page (e.g. a job description on Greenhouse/Lever/Ashby, or a full article) so you can summarize it or tailor an application to it.",
  parameters: { url: { type: "string", description: "The URL to fetch", required: true } },
  effect: "read",
  async execute({ url }) {
    // Prefer Exa's content extraction (handles rendering); fall back to plain fetch.
    if (exa) {
      try {
        const r = (await exa.getContents([url], { text: { maxCharacters: 6000 } as never })) as {
          results?: { text?: string; title?: string }[];
        };
        const hit = r.results?.[0];
        if (hit?.text) {
          const sig: Signal = { id: nanoid(10), source: "news", title: hit.title ?? url, body: hit.text.slice(0, 1500), url, ts: new Date().toISOString() };
          return { ok: true, data: { via: "exa" }, error: null, signals: [sig], modelText: hit.text.slice(0, 6000) };
        }
      } catch {
        /* fall through to plain fetch */
      }
    }
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } });
      if (!resp.ok) return { ok: false, data: null, error: `fetch ${resp.status}` };
      const text = stripHtml(await resp.text()).slice(0, 6000);
      const sig: Signal = { id: nanoid(10), source: "news", title: url, body: text.slice(0, 1500), url, ts: new Date().toISOString() };
      return { ok: true, data: { via: "fetch" }, error: null, signals: [sig], modelText: text };
    } catch (err) {
      return { ok: false, data: null, error: String(err) };
    }
  },
};
