// Material handling — find a cold contact's email. Two Apify actors:
//  1) PRIMARY (name + domain): clearpath/email-finder-api guesses the person's
//     real address from name + company domain and verifies deliverability.
//  2) FALLBACK (domain only, or primary finds nothing): scrapingxpert/email-scraper-pro
//     crawls the site for PUBLISHED emails (mostly role inboxes like info@).
// Wrapped as a harness tool so it flows through guardrails + tracing. Degrades
// gracefully without an Apify token.
import Exa from "exa-js";
import { nanoid } from "nanoid";
import { resolveMx } from "node:dns/promises";
import { config, hasApify, hasExa, hasProspeo } from "../config.js";
import type { Signal, Tool } from "../harness/types.js";

const exa = hasExa() ? new Exa(config.exaApiKey) : null;

// Hosts that are never a company's own domain.
const NON_COMPANY = new Set([
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "crunchbase.com",
  "wikipedia.org", "github.com", "youtube.com", "medium.com", "substack.com", "bloomberg.com",
  "techcrunch.com", "forbes.com", "pitchbook.com", "glassdoor.com", "indeed.com", "reuters.com",
]);

/**
 * Resolve an org NAME to its real website domain via Exa (e.g. "ChipAgents" →
 * "chipagents.ai"). This is the automation that lets outreach work from just a
 * name + company, with no domain provided. Returns undefined if nothing confident.
 */
export async function resolveOrgDomain(org: string): Promise<string | undefined> {
  if (!exa || !org.trim()) return undefined;
  try {
    const res = await exa.searchAndContents(`${org} official company website`, { numResults: 6, type: "auto", text: { maxCharacters: 1 } });
    const compact = org.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hosts = res.results
      .map((r) => { try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return ""; } })
      .filter((h) => h && !NON_COMPANY.has(h));
    // Prefer a domain whose root contains the squashed org name (chipagents → chipagents.ai).
    const match = hosts.find((h) => compact && h.replace(/[^a-z0-9]/g, "").includes(compact.slice(0, Math.max(4, compact.length - 2))));
    return match ?? hosts[0];
  } catch {
    return undefined;
  }
}

const FINDER = "clearpath~email-finder-api"; // name + domain -> verified personal email
const SCRAPER = "scrapingxpert~email-scraper-pro"; // crawl site -> published emails
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function bareDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^@/, "").split("/")[0]!;
  return s;
}

async function apify(actor: string, input: unknown, timeoutMs = 150_000): Promise<unknown[] | { error: string }> {
  const resp = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${config.apifyToken}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!resp.ok) return { error: `apify ${resp.status}: ${(await resp.text()).slice(0, 160)}` };
  return (await resp.json()) as unknown[];
}

interface FinderRow {
  email?: string;
  status?: string;
  isDeliverable?: boolean;
  isSafeToSend?: boolean;
  isRoleAccount?: boolean;
  overallScore?: string | number;
}

export interface EmailFindResult {
  email?: string; // best personal email if found
  deliverable?: boolean;
  safeToSend?: boolean;
  score?: number;
  emails: string[]; // all candidates, personal first then role inboxes
  count: number;
  source?: "finder" | "scraper" | "pattern";
  /** Human-readable reason when no confident personal address was resolved, so
   *  the send path can surface a real explanation instead of a silent miss. */
  note?: string;
}

/** Prospeo enrich-person: verified B2B email by name + company domain. Returns
 *  a result only on a confident match; null on no-match / rate-limit / error. */
async function prospeoLookup(name: string, domain: string): Promise<EmailFindResult | null> {
  const { first, last } = parseName(name);
  if (!first || !last) return null; // needs first + last (after stripping titles)
  try {
    const resp = await fetch("https://api.prospeo.io/enrich-person", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": config.prospeoApiKey },
      body: JSON.stringify({ data: { first_name: first, last_name: last, company_website: domain } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { error?: boolean; person?: { email?: { email?: string; status?: string; revealed?: boolean } } };
    const e = json?.person?.email;
    if (json.error || !e?.email || e.revealed === false) return null;
    const verified = (e.status ?? "").toUpperCase() === "VERIFIED";
    return {
      email: e.email.toLowerCase(),
      deliverable: true,
      safeToSend: verified, // verified → auto-send eligible
      score: verified ? 95 : 70,
      emails: [e.email.toLowerCase()],
      count: 1,
      source: "finder",
    };
  } catch {
    return null;
  }
}

/** Does the domain actually accept mail? (free DNS MX check, ~no latency). */
async function domainHasMx(domain: string): Promise<boolean> {
  try {
    const mx = await resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}

// Honorific prefixes and trailing credentials that are NOT part of the name and
// must be stripped before resolving an address — otherwise "Dr. Bakre" resolves
// to dr.bakre@… and every tier fails. (The real send-failure root cause.)
const NAME_TITLES = new Set([
  "dr", "prof", "professor", "mr", "mrs", "ms", "miss", "mx", "sir", "madam",
  "rev", "fr", "hon", "capt", "col", "lt", "sgt", "gen", "maj",
]);
const NAME_SUFFIXES = new Set([
  "md", "phd", "mph", "msc", "do", "dds", "dvm", "esq", "jr", "sr",
  "ii", "iii", "iv", "mba", "rn", "np", "pa", "facs", "faap", "msn", "edd",
]);

/**
 * Normalize a person's name to clean {first, last} for email resolution: fold
 * diacritics, lowercase, drop honorific prefixes (Dr./Prof./Mr.) and trailing
 * credentials (MD, PhD, Jr), reduce to alpha tokens.
 *   "Dr. Bakre"          → { first: "bakre", last: "" }
 *   "Dr. Asha Bakre, MD" → { first: "asha",  last: "bakre" }
 *   "Gabriele Campanella"→ { first: "gabriele", last: "campanella" }
 */
export function parseName(raw: string): { first: string; last: string } {
  const tokens = (raw ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // strip accents
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^a-z]/g, "")) // dots, hyphens, apostrophes out
    .filter(Boolean)
    .filter((t) => !NAME_TITLES.has(t) && !NAME_SUFFIXES.has(t));
  if (!tokens.length) return { first: "", last: "" };
  return { first: tokens[0]!, last: tokens.length > 1 ? tokens[tokens.length - 1]! : "" };
}

/**
 * Ranked candidate emails for a name at a domain, most-common corporate formats
 * first. Widens the free pattern tier's hit-rate and gives the send path
 * alternates when the top guess isn't deliverable.
 */
export function emailCandidates(first: string, last: string, domain: string): string[] {
  if (!first) return [];
  const fi = first[0]!;
  const locals = last
    ? [`${first}.${last}`, `${fi}${last}`, `${first}${last}`, `${first}_${last}`, `${first}`, `${first}.${last[0]!}`, `${last}.${first}`, `${last}${fi}`]
    : [first];
  return [...new Set(locals)].filter(Boolean).map((lp) => `${lp}@${domain}`);
}

/** Build the local part for `name` in a given style. */
function localFor(first: string, last: string, style: "first.last" | "flast" | "firstlast" | "first"): string {
  switch (style) {
    case "flast": return `${first[0] ?? ""}${last}`;
    case "firstlast": return `${first}${last}`;
    case "first": return first;
    default: return last ? `${first}.${last}` : first;
  }
}

/**
 * Learn the domain's email STYLE from any personal addresses the site publishes,
 * then apply it to the target name. This is the free version of what Clay does:
 * infer the format once, reuse it. Falls back to the global-default first.last.
 */
function patternFromKnown(name: string, domain: string, known: string[]): { email: string; inferred: boolean; candidates: string[] } {
  const { first, last } = parseName(name);
  if (!first) return { email: "", inferred: false, candidates: [] };

  // Inspect non-role local parts at this domain to detect the separator style.
  const locals = known
    .filter((e) => e.endsWith(`@${domain}`))
    .map((e) => e.split("@")[0]!)
    .filter((l) => !/^(info|contact|hello|hi|team|sales|support|careers|jobs|hr|admin|press|media|noreply|no-reply)$/.test(l));
  let style: "first.last" | "flast" | "firstlast" | "first" = "first.last";
  let inferred = false;
  if (last && locals.length) {
    if (locals.some((l) => /^[a-z]+\.[a-z]+$/.test(l))) { style = "first.last"; inferred = true; }
    else if (locals.some((l) => /^[a-z][a-z]+$/.test(l) && l.length <= last.length + 2)) { style = "flast"; inferred = true; }
  }
  const best = `${localFor(first, last, style)}@${domain}`;
  // Lead with the inferred/best guess, then the other common formats as fallbacks.
  const candidates = [best, ...emailCandidates(first, last, domain)].filter((e, i, a) => a.indexOf(e) === i);
  return { email: best, inferred, candidates };
}

/** Programmatic finder used by executeAction (and the agent tool below). */
export async function findContactEmail(domain: string, name?: string): Promise<{ ok: boolean; data: EmailFindResult | null; error?: string }> {
  const dom = bareDomain(domain);

  // ── 0) PROSPEO: verified B2B finder (best signal, auto-send eligible) ───────
  if (name?.trim() && hasProspeo()) {
    const p = await prospeoLookup(name, dom);
    if (p) return { ok: true, data: p };
  }

  // The remaining tiers (clearpath + site scraper) need Apify. Pattern+MX is free.
  if (!hasApify() && !hasProspeo()) return { ok: false, data: null, error: "no email finder configured — connect Prospeo/Hunter or set APIFY_TOKEN." };

  // ── 1) clearpath: name + domain -> verified personal email (apify) ─────────
  if (name && name.trim() && hasApify()) {
    const { first: firstName, last: surname } = parseName(name);
    const out = await apify(FINDER, { people: [{ firstName, surname, domain: dom }] }, 180_000);
    if (!Array.isArray(out) && out.error) {
      // primary failed hard — fall through to scraper rather than erroring out
    } else if (Array.isArray(out)) {
      const row = (out[0] as FinderRow) ?? {};
      if (row.email && row.status === "found") {
        return {
          ok: true,
          data: {
            email: row.email.toLowerCase(),
            deliverable: row.isDeliverable,
            safeToSend: row.isSafeToSend,
            score: Number(row.overallScore ?? 0),
            emails: [row.email.toLowerCase()],
            count: 1,
            source: "finder",
          },
        };
      }
    }
  }

  // ── 2) FALLBACK: crawl the site for published emails (role inboxes) ─────────
  const scraped = hasApify() ? await apify(SCRAPER, { start_urls: [{ url: `https://${dom}` }], max_depth: 2 }) : [];
  const found = Array.isArray(scraped)
    ? [...new Set((JSON.stringify(scraped).match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))].filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/.test(e))
    : [];
  const needle = name?.toLowerCase().replace(/\s+/g, "") ?? "";
  const ranked = found.sort((a, b) => roleScore(b, needle) - roleScore(a, needle));
  const scrapedPersonal = needle ? ranked.find((e) => e.split("@")[0]!.includes(needle)) : undefined;

  // A published personal address beats a guess.
  if (scrapedPersonal) return { ok: true, data: { email: scrapedPersonal, deliverable: true, emails: ranked, count: ranked.length, source: "scraper" } };

  // ── 3) FREE pattern tier: infer the domain's email style from published
  //    addresses (Clay-style), apply it to the name, MX-check the domain.
  //    Always DRAFTED (never auto-sent) so the user eyeballs it first.
  if (name && name.trim()) {
    const { email: guess, inferred, candidates } = patternFromKnown(name, dom, found);
    if (guess) {
      const mx = await domainHasMx(dom);
      // score: inferred-from-real-pattern + MX is the strongest free signal.
      const score = (inferred ? 50 : 30) + (mx ? 20 : 0);
      // Lead with the best guess, then the other ranked format candidates, then any scraped role inboxes.
      const emails = [...candidates, ...ranked].filter((e, i, a) => a.indexOf(e) === i);
      return {
        ok: true,
        data: { email: guess, deliverable: mx, safeToSend: false, score, emails, count: emails.length, source: "pattern" },
      };
    }
  }
  // Nothing personal resolved — return whatever role inboxes were scraped, with
  // a clear reason so the caller (and the send path) can explain the miss.
  const note = name?.trim()
    ? parseName(name).first
      ? `no verified personal address found for "${name}" on ${dom}; only role/published inboxes (or none).`
      : `could not parse a usable name from "${name}" — looks like a title/honorific only; provide a first and last name.`
    : `no name provided — returning published/role inboxes on ${dom} (give a name for a personal-address lookup).`;
  return { ok: true, data: { emails: ranked, count: ranked.length, source: "scraper", note } };
}

export const findEmail: Tool<{ domain: string; name?: string }> = {
  name: "find_email",
  description:
    "Find a COLD contact's email from their company domain. Give `domain` (e.g. 'pathai.com') and, when you know it, the person's `name` — with a name it guesses and VERIFIES their personal address (e.g. andrew.beck@pathai.com); without a name it returns published role inboxes (info@, careers@). Use before draft_email when the recipient isn't in the user's Gmail. Never invent an address; only use what this returns.",
  parameters: {
    domain: { type: "string", description: "Company domain or website (e.g. 'pathai.com')", required: true },
    name: { type: "string", description: "The person's full name — enables verified personal-email lookup" },
  },
  effect: "read",
  async execute({ domain, name }) {
    const r = await findContactEmail(domain, name);
    if (!r.ok || !r.data) return { ok: false, data: null, error: r.error ?? "lookup failed", signals: [] };
    const d = r.data;
    const sig: Signal = { id: nanoid(10), source: "news", title: `email lookup @ ${bareDomain(domain)}`, body: d.emails.join(", ") || "(none)", url: `https://${bareDomain(domain)}`, ts: new Date().toISOString() };
    if (d.source === "finder" && d.email) {
      const conf = d.safeToSend ? "verified deliverable" : d.deliverable ? "likely deliverable (domain is catch-all, not 100%)" : "pattern match, unverified";
      return { ok: true, data: d, error: null, signals: [sig], modelText: `found ${d.email} for ${name} (${conf}, score ${d.score}). use this address.` };
    }
    if (d.source === "pattern" && d.email) {
      return { ok: true, data: d, error: null, signals: [sig], modelText: `best guess for ${name} is ${d.email} (standard first.last format, NOT verified). draft it for review; do not treat it as confirmed.` };
    }
    if (d.count === 0) return { ok: true, data: d, error: null, signals: [sig], modelText: d.note ?? `no email found for ${name ?? "that contact"} on ${bareDomain(domain)}.` };
    return { ok: true, data: d, error: null, signals: [sig], modelText: `${d.note ? d.note + " " : "no verified personal email; "}published addresses on ${bareDomain(domain)}: ${d.emails.slice(0, 5).join(", ")} (mostly role inboxes — pick the best fit).` };
  },
};

function roleScore(email: string, needle: string): number {
  let s = 0;
  if (needle && email.split("@")[0]!.includes(needle)) s += 10;
  if (/^(founder|ceo|hello|hi|contact|team)@/.test(email)) s += 3;
  if (/^(info|careers|jobs|hr|support|sales|noreply|no-reply)@/.test(email)) s += 1;
  return s;
}
