// ─────────────────────────────────────────────────────────────────────────────
// AGENTIC BRIEF — the harness deploys a fleet of scout agents, one per domain.
// Each scout DECIDES its own searches, uses tools, and writes its section +
// actions. They run in parallel and are each governed by the same pillars
// (guardrail-wrapped tools, traced, checkpointed). This is "multiple agents
// working through a harness", not a scripted pipeline.
// ─────────────────────────────────────────────────────────────────────────────
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { config } from "../config.js";
import { loadProfile } from "../profile.js";
import { Observability } from "./observability.js";
import { dispatch, REGISTRY, type DispatchState } from "./tools.js";
import { outputGuardrails } from "./guardrails.js";
import { readImessage } from "../tools/imessage.js";
import { getEmailStyle, getOrLearnEmailStyle } from "../google/emailStyle.js";
import { backfillImages } from "../og.js";
import { listContacts } from "../pipeline.js";
import { todosForBrief, localDateISO } from "../todos.js";
import { cleanDraft, deslopEmail, noHyphens } from "../format.js";
import type { ActionItem, Agent, Brief, BriefSectionItem, EmitFn, Tool } from "./types.js";

const now = () => new Date().toISOString();

// Each scout is an autonomous agent with a domain charter and a tool loadout.
interface Scout {
  domain: string;
  charter: string;
  tools: string[];
}

const SCOUTS: Scout[] = [
  {
    domain: "Medtech & Medical AI",
    charter:
      "the WHOLE medtech and health landscape, broad: medical devices, diagnostics, digital health, biotech, drug discovery, FDA and regulatory moves, hospital and clinical operations, and medtech funding / M&A. Cover MEDICAL AI ACROSS THE ENTIRE FIELD, not just pathology — clinical LLMs, medical imaging and radiology, surgery and devices, and a general-tech or AI company moving into healthcare (e.g. an image-generation lab entering medicine). Spread your searches across SEVERAL of these subtopics so the section reads BROAD, not one repeated beat. Computational pathology and IHC biomarker quantification are ONE strand here, the user's own niche (MedMorphIQ's world), so connect those items back to him: frame MedMorphIQ Ki-67 first — Ki-67 IHC quantification is the SHIPPED product (deployed at ESI and GKNM), while ER/PR quantification is the Q3 ROADMAP, not the current product, and never describe ER/PR as already shipped. But pathology is at most ONE item, NOT the whole section — lead with broad medtech and keep pathology a single thread.",
    tools: ["search_news", "fetch_rss"],
  },
  {
    domain: "AI Infra & Chip Verification",
    charter:
      "AI infrastructure, inference, agent frameworks, AND chip design verification / custom ASIC (the user's Intel work on a multi-agent LLM framework for DV engineers).",
    tools: ["search_news", "fetch_rss"],
  },
  {
    domain: "Tech",
    charter:
      "the broader tech landscape: the day's biggest product launches, big-tech and startup moves, and notable AI developments. Cover what's genuinely making waves industry-wide. Do NOT over-index on any single company (Anthropic/OpenAI/etc.) — only include a specific company's news if it's a real headline that day.",
    tools: ["search_news", "fetch_rss"],
  },
  {
    domain: "VC & Accelerators",
    charter:
      "early-stage AI funding, notable rounds, accelerators (YC, a16z, Sequoia), and compute-credit programs relevant to a pre-revenue founder like the user.",
    tools: ["search_news", "fetch_rss"],
  },
  {
    domain: "Markets & Quant",
    charter: "quant finance, market structure, systematic strategies, and notable market moves. For specific price moves, levels, or numbers, call search_news with trusted=true (Bloomberg, Reuters, WSJ, CNBC) and only state figures a reputable source reports. Do not estimate or invent numbers.",
    tools: ["search_news"],
  },
  {
    domain: "Sports",
    charter:
      "the user's sports follow: TENNIS first (ATP / WTA / Grand Slam results, scores, who advanced, upcoming marquee matches), then general sports the day delivered (NBA, NFL, soccer / Champions League, F1, big upsets or finals). Lead with actual SCORES and results, not commentary. ALWAYS call search_news with trusted=true for scores so you only pull from AP, Reuters, ESPN, official league sites. Report a score ONLY if a reputable source states it as the FINAL result. NEVER report a predicted, simulated, projected, or in progress game as if it were final. If a game is upcoming or live, say so, do not invent a final score. If sources disagree or you cannot confirm, leave it out.",
    tools: ["search_news", "fetch_url"],
  },
  {
    domain: "Jobs",
    charter:
      "internships and new-grad roles in AI/ML, quant, medical-AI, or infra that match the user's profile. For the strongest 1-2 matches, fetch the job description with fetch_url and build a tailored application kit.",
    tools: ["search_jobs", "search_news", "fetch_url"],
  },
  {
    domain: "Inbox",
    charter:
      "the user's recent email, texts, and calendar. Surface what needs a reply, who to follow up with, and meeting prep for today. For people in the texts, you may search their history for context.",
    tools: ["read_gmail", "read_imessage", "read_calendar"],
  },
];

export async function generateBrief({ emit, worker }: { emit: EmitFn; worker: Agent }): Promise<Brief> {
  const runId = nanoid(12);
  const obs = new Observability(runId, emit);
  db.prepare(`INSERT INTO runs (id, kind, started_at, status) VALUES (?, 'brief', ?, 'running')`).run(runId, now());

  // Learn the user's real email voice (cached weekly) so outreach drafts match.
  await getOrLearnEmailStyle(worker).catch(() => null);

  // ── DISPATCH: deploy the scout fleet ──────────────────────────────────────
  obs.checkpoint("AGENT_DISPATCH", "pass", { agents: SCOUTS.map((s) => s.domain) });
  emit({ kind: "status", id: "dispatch", label: `deploying ${SCOUTS.length} scout agents…`, tool: "supervisor", state: "start" });

  const results = await Promise.allSettled(SCOUTS.map((scout) => runScout(scout, worker, runId, obs, emit)));
  emit({ kind: "status", id: "dispatch", label: `${SCOUTS.length} scout agents reported back`, tool: "supervisor", state: "done" });

  // ── Collect a FLAT feed of items + actions from every agent ───────────────
  let items: BriefSectionItem[] = [];
  let actions: ActionItem[] = [];
  const scoutLog: { domain: string; ok: boolean; items: number; actions: number }[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { domain, items: its, actions: acts } = r.value;
    scoutLog.push({ domain, ok: its.length > 0, items: its.length, actions: acts.length });
    items.push(...its);
    actions.push(...acts);
  }

  // Attach real article images (Exa) by matching item url → fetched signal image.
  const urlImage = new Map<string, string>();
  const urlSource = new Map<string, Brief["citedSources"][number]["source"]>();
  for (const s of db.prepare(`SELECT url, source, meta FROM signals WHERE run_id = ? AND url IS NOT NULL`).all(runId) as { url: string; source: Brief["citedSources"][number]["source"]; meta: string | null }[]) {
    urlSource.set(s.url, s.source);
    const img = s.meta ? (JSON.parse(s.meta) as { image?: string }).image : undefined;
    if (img && !urlImage.has(s.url)) urlImage.set(s.url, img);
  }
  for (const it of items) if (it.url && urlImage.has(it.url)) it.image = urlImage.get(it.url);
  // Backfill covers from each article's og:image where the search didn't give one.
  await backfillImages(items);

  // ── OUTPUT GUARDRAIL: hallucination fence over each item ──────────────────
  const corpus = (db.prepare(`SELECT title, body FROM signals WHERE run_id = ?`).all(runId) as { title: string; body: string }[]).map((s) => ({ title: s.title, body: s.body }));
  let flagged = 0;
  for (const item of items) {
    const { decisions } = outputGuardrails(`${item.title} ${item.summary}`, corpus);
    if (decisions.length) {
      item.flagged = true;
      flagged += 1;
    }
  }

  // ── DEDUPE (scouts independently find the same big stories) + RANK + CAP ──
  items = dedupeItems(items);     // near-identical text (same article)
  items = dedupeByEntity(items);  // same entity/company across different articles (one per entity)
  items.sort((a, b) => (b.score ?? 0.5) - (a.score ?? 0.5));
  items = capForReadability(items, 20); // a tight, scannable feed — not a firehose (backfills freed slots)

  obs.checkpoint("BRIEF_GENERATION", items.length > 0 ? "pass" : "fail", { scouts: scoutLog, items: items.length, flagged });
  if (items.length === 0) obs.alarm("LOW_SIGNAL", "No scout agent returned usable signal today.");
  if (flagged > 0) obs.alarm("HALLUCINATION_DETECTED", `${flagged} item(s) referenced an unsourced entity and were flagged.`);

  // ── Dedup + finalize actions; fold in pending outreach reminders ──────────
  actions = dedupeActions(actions);
  for (const c of listContacts("to_reach_out")) {
    actions.push({
      id: nanoid(8),
      kind: "follow_up",
      who: c.name,
      org: c.org ?? undefined,
      reason: noHyphens(`reach out: ${c.note ?? "you flagged this person"}${c.org ? ` (${c.org})` : ""}`),
      url: c.link,
      sourceSignalIds: [],
    });
  }
  obs.checkpoint("ACTION_EXTRACT", "pass", { actions: actions.length });

  // ── Todos: undated resurface daily; dated ones only on/around their due date ─
  const todos = todosForBrief(localDateISO()).map((t) => ({ id: t.id, title: t.title, detail: t.detail, tag: t.tag, dueDate: t.dueDate }));

  // ── EDITOR: a personal top-line so it reads curated, not dumped ───────────
  const topline = await editorTopline(worker, items, actions).catch(() => undefined);

  // Sources = exactly the links behind the ranked items.
  const seenUrls = new Set<string>();
  const citedSources: Brief["citedSources"] = [];
  for (const it of items) {
    if (it.url && !seenUrls.has(it.url)) {
      seenUrls.add(it.url);
      citedSources.push({ id: nanoid(6), title: it.title, url: it.url, source: urlSource.get(it.url) ?? "news" });
    }
  }

  // ── DELIVER ───────────────────────────────────────────────────────────────
  const brief: Brief = { id: nanoid(10), generatedAt: now(), topline, items, actions, todos, citedSources };

  // EMPTY-BRIEF GUARD: a 0-item generation is NOT a valid brief. Never persist it —
  // doing so would overwrite the last good brief as "today's" and the UI would show
  // a blank read. Mark the run empty, alarm, and leave latestBrief() serving the
  // previous good brief. The caller (scheduler) retries; the manual regen keeps the
  // existing brief on screen instead of replacing it with an empty one.
  if (items.length === 0) {
    db.prepare(`UPDATE runs SET ended_at = ?, status = 'empty' WHERE id = ?`).run(now(), runId);
    obs.checkpoint("DELIVER", "fail", { briefId: brief.id, items: 0, reason: "empty brief not persisted" });
    obs.alarm("EMPTY_BRIEF", "Generated brief had 0 items — kept the previous brief and did not overwrite it.");
    emit({ kind: "status", id: "deliver", label: "no fresh signal today — kept your last brief", tool: "supervisor", state: "error" });
    emit({ kind: "done", threadId: "", messageId: brief.id, usedTools: SCOUTS.flatMap((s) => s.tools), usage: { inputTokens: 0, outputTokens: 0 } });
    return brief;
  }

  db.prepare(`INSERT INTO briefs (id, generated_at, payload) VALUES (?, ?, ?)`).run(brief.id, brief.generatedAt, JSON.stringify(brief));
  db.prepare(`UPDATE runs SET ended_at = ?, status = 'done' WHERE id = ?`).run(now(), runId);
  obs.checkpoint("DELIVER", "pass", { briefId: brief.id, items: items.length, actions: actions.length });
  emit({ kind: "canvas", canvasKind: "brief", payload: brief });
  emit({ kind: "done", threadId: "", messageId: brief.id, usedTools: SCOUTS.flatMap((s) => s.tools), usage: { inputTokens: 0, outputTokens: 0 } });

  // Mine today's texts + chats → seeds tomorrow's scouts.
  mineInterests(worker).catch(() => {});
  return brief;
}

// ── A single scout agent ──────────────────────────────────────────────────────
interface ScoutResult {
  domain: string;
  items: BriefSectionItem[];
  actions: ActionItem[];
}

async function runScout(scout: Scout, worker: Agent, runId: string, obs: Observability, emit: EmitFn): Promise<ScoutResult | null> {
  const statusId = `scout-${scout.domain}`;
  emit({ kind: "status", id: statusId, label: `${scout.domain.toLowerCase()} agent researching…`, tool: "scout", state: "start" });

  const state: DispatchState = { runId, emit, obs, enrichmentCount: 0 };
  const toolSpecs: Tool[] = scout.tools.map((n) => REGISTRY[n]).filter(Boolean) as Tool[];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 220_000);

  try {
    const out = await obs.span(`agent.scout.${scout.domain}`, { domain: scout.domain }, () =>
      worker.run({
        runId,
        system: scoutSystem(scout),
        prompt:
          `${scout.domain === "Inbox" ? "Read email, texts, and calendar." : "Run a few targeted searches (about 2 to 4) to get good coverage of your domain."} ` +
          `Then output your brief section as JSON and stop. Surface everything genuinely relevant, but make sure you finish with valid JSON well within your turn budget — do not keep researching forever.`,
        history: [],
        toolSpecs,
        callTool: (name, args) => dispatch(name, args, state),
        emit: () => {}, // scouts don't stream tokens into chat; their tool calls already show as status
        signal: ac.signal,
        model: config.model,
        maxTurns: 16,
      }),
    );

    const parsed = safeJsonObject<{ items?: RawItem[]; actions?: RawAction[] }>(out.text);
    const items: BriefSectionItem[] = (parsed?.items ?? [])
      .filter((it) => it.title && it.whyItMatters) // drop orphans with no connection
      .slice(0, 8)
      .map((it) => ({
        title: noHyphens(it.title ?? ""),
        summary: noHyphens(it.summary ?? ""),
        whyItMatters: noHyphens(it.whyItMatters ?? ""),
        url: it.url,
        score: typeof it.score === "number" ? Math.max(0, Math.min(1, it.score)) : 0.5,
        sourceTag: scout.domain.toLowerCase(),
      }));
    const actions: ActionItem[] = (parsed?.actions ?? []).map((a) => ({
      id: nanoid(8),
      kind: a.kind ?? "follow_up",
      who: a.who,
      org: a.org,
      orgDomain: a.orgDomain,
      reason: noHyphens(a.reason ?? ""),
      suggestedChannel: a.suggestedChannel,
      subject: a.subject ? noHyphens(a.subject) : undefined,
      draftOpener: a.draftBody ? (a.kind === "email" ? deslopEmail(cleanDraft(a.draftBody)) : cleanDraft(a.draftBody)) : undefined,
      url: a.url,
      sourceSignalIds: a.sourceSignalIds ?? [],
    }));

    emit({ kind: "status", id: statusId, label: `${scout.domain.toLowerCase()} agent: ${items.length} items, ${actions.length} actions`, tool: "scout", state: "done" });
    return { domain: scout.domain, items, actions };
  } catch (err) {
    obs.alarm("SOURCE_DEGRADED", `${scout.domain} scout failed: ${String(err).slice(0, 120)}`);
    emit({ kind: "status", id: statusId, label: `${scout.domain.toLowerCase()} agent failed`, tool: "scout", state: "error" });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function scoutSystem(scout: Scout): string {
  const interests = topInterests(6);
  const interestLine = interests.length
    ? `The user has recently been talking about: ${interests.join("; ")}. If any of these touch your domain, pull on them.`
    : "";
  return [
    `You are the ${scout.domain} scout agent inside Solo, a personal intelligence harness. You serve the user described below.`,
    `Your charter: ${scout.charter}`,
    interestLine,
    "",
    "Use your tools to research TODAY's developments in your domain — decide your own search queries, run them, read the results. Use ONLY what the tools return; never invent facts, names, or numbers.",
    "SOURCE QUALITY: trust reputable, primary sources (major news outlets, official sites, the company or person themselves, peer reviewed work). Be skeptical of a single low quality source. A 'result', 'score', 'number', or 'funding amount' must come from a credible source that states it as confirmed fact, not a prediction, projection, rumor, simulation, or preview. If something is upcoming or unconfirmed, say so plainly instead of stating it as done. If you cannot corroborate a striking claim, drop it. Every item must carry the real source url it came from.",
    "BE DECISIVE: run just 1 to 2 searches (Inbox: one read of each source), then write your JSON and stop. You have a limited turn budget — do not keep researching past what you need.",
    "",
    "Then write your items for one unified morning feed (NOT a topic section — your items get merged with every other scout's into a single ranked list).",
    "",
    "WRITE LIKE A SHARP HUMAN EDITOR briefing a smart friend. Not a press release, not buzzword soup. Hard rules:",
    "- Short sentences. ONE idea per sentence. If a sentence has two 'and's, split it.",
    "- Concrete nouns, plain verbs. Name the thing, say what happened, say the number.",
    "- Max ONE piece of jargon per sentence, and only if it's load-bearing. Never stack jargon (bad: 'multi agent LLM framework for DV engineers shipping at the big three EDA vendors' — break that into separate sentences).",
    "- lowercase. no hyphens or dashes of any kind. direct, lead with the point.",
    "",
    "For each item provide:",
    "- title: short and plain, says the actual thing",
    "- summary: what happened, in 2 to 3 clean factual sentences. specifics: who, how much, what shipped. one idea per sentence.",
    "- whyItMatters: 1 to 2 sentences, second person, said simply (e.g. 'this is the bar your ER/PR work has to beat'). the personal angle for the user (MedMorphIQ / ER-PR / IHC, the Intel DV work, the harness, accelerators, or what they've been talking about). MANDATORY. if you can't connect it to them simply and truthfully, DROP the item.",
    "- score: 0.0 to 1.0, how much this matters to them TODAY (drives ranking; reserve >0.8 for things that truly matter)",
    "Surface every genuinely relevant item (up to 8).",
    "",
    "Read each sentence back. If it sounds exhausting or stacked, rewrite it shorter.",
    "",
    "Then any ACTIONS: who to contact, what to apply to, which thread to reply to, and why. For outreach actions, write a complete, ready-to-send draftBody.",
    "ACTION FIELDS (strict): `who` = the person's NAME ONLY (e.g. 'Kexun Zhang') — never put their title or company in the name field. Put the company in `org` (e.g. 'ChipAgents') and the company's real website domain in `orgDomain` (e.g. 'chipagents.ai'); use the domain you actually saw while researching, do not invent one. Solo uses orgDomain to find their email automatically, so always set it for email actions.",
    "EMAIL SUBJECT (required for email actions): write a SHORT, specific `subject` of 3 to 6 words. It must reference the real shared topic, never a greeting or the first line of the body. lowercase is fine. Good: 'role decomposition in asic agents', 'her2 scoring without a scanner'. Bad: 'Hi Kexun', 'quick question', 'reaching out', or anything copied from the message body.",
    "For JOB actions (kind 'job'): set `url` to the apply link. If you fetched the job description, write `draftBody` as a tailored APPLICATION KIT: a short cover note in the user's voice, 3-4 resume bullets matched to this specific role using the user's background, and ready answers to the 2 most likely application questions (why this company, why you). Format it cleanly with labels so they can paste each part.",
    "",
    "DRAFT STYLE:",
    "- EMAIL drafts: write like a sharp human who values the reader's time, NOT an AI cold email. 5 to 7 short sentences total. Open by naming the ONE specific thing of theirs you saw (the actual paper/result/launch, by name, with the real detail). Then one or two lines on what the user is building that genuinely overlaps. Then ONE small concrete ask. That is it.",
    "- These phrases SCREAM ai slop. NEVER use them or anything like them: 'I came across', 'I hope this finds you well', 'really resonated', 'the framing resonated', 'I would genuinely love', 'No pitch', 'Would you be open to', 'For some context, I am', 'compare notes', 'touch base', 'reach out', 'I think about X across two domains', 'love to pick your brain'. Say the real thing instead.",
    "- Specific beats flattering: one concrete detail about their work is worth more than three compliments. Cut every sentence that does not carry information.",
    "- Sign off plainly: just 'Rishik' (or 'Rishik Kolpekwar' if formal). Do NOT append a title + company + url signature block unless it actually matters.",
    "- A real salutation is fine ('Hi Kexun,'), but everything after it should sound like the user wrote it in two minutes, not a template.",
    "- TEXT / iMessage drafts: casual and lowercase, how they text.",
    emailStyleBlock(),
    "",
    "FORMATTING RULES (strict):",
    "- NEVER use hyphens or dashes of any kind (-, –, —) in any text. Rephrase instead. This is a hard rule.",
    "- direct and concise; no corporate filler.",
    "",
    'Output ONLY JSON (no prose around it): {"items":[{"title":string,"summary":string,"whyItMatters":string,"score":number,"url"?:string}],"actions":[{"kind":"email"|"job"|"follow_up","who"?:string,"org"?:string,"orgDomain"?:string,"reason":string,"suggestedChannel"?:string,"subject"?:string,"draftBody"?:string,"url"?:string,"sourceSignalIds":string[]}]}',
    "",
    "── USER PROFILE ──",
    loadProfile(),
  ].join("\n");
}

function emailStyleBlock(): string {
  const guide = getEmailStyle();
  return guide ? `\n── USER'S REAL EMAIL STYLE (mirror this for email drafts) ──\n${guide}` : "";
}

// Editor agent: one personal top-line summarizing what actually matters today.
async function editorTopline(worker: Agent, items: BriefSectionItem[], actions: ActionItem[]): Promise<string | undefined> {
  if (items.length === 0) return undefined;
  const outline = items.slice(0, 15).map((i) => `- ${i.title} (why: ${i.whyItMatters})`).join("\n");
  const actionList = actions.slice(0, 6).map((a) => `${a.kind}: ${a.who ?? a.reason}`).join("\n");
  const text = await runWorkerText(
    worker,
    [
      "You are the editor of this person's morning brief. Write the opening paragraph of the read.",
      "3 to 4 SHORT sentences, max. One idea per sentence. lowercase. no hyphens or dashes. plain words. lead with the point. no preamble.",
      "Make it ACTIONABLE, not a summary. Each sentence should point at something he can DO today: who to email or reach out to, what to apply to, the competitive bar to beat tied to HIS roadmap (the ER/PR IHC Q3 work, the Intel DV multi-agent framework, the harness, accelerators). Tie the day's items + actions to a concrete next move.",
      "Prefer verbs he acts on: email, reply, apply, ship, benchmark, beat, ping. If there is a person worth contacting or a job worth applying to today, name it in the lede.",
      "Do not stack clauses. If a sentence has two 'and's, split it.",
      "Good (actionable) example: 'two things are worth a move today. kexun at chipagents is building the asic-agent orchestration you work on at intel, so send the note now while it is fresh. and a new ASCO model grades HR/HER2 from images alone, which is the bar your ER/PR Q3 has to beat, so read it before your next ESI call.'",
      "Bad (just summary): 'today there is news about biomarker scoring and agent frameworks.' Never write like that.",
    ].join("\n"),
    `Profile:\n${loadProfile()}\n\nToday's items:\n${outline}\n\nActions:\n${actionList}`,
  );
  return text ? noHyphens(text.trim()) : undefined;
}

// Collapse near-duplicate items (same story found by multiple scouts). Keeps the
// highest-scoring copy (and prefers one that has an image/url).
function dedupeItems(items: BriefSectionItem[]): BriefSectionItem[] {
  const normTokens = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4));
  const jaccard = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter += 1;
    return inter / (a.size + b.size - inter);
  };
  const ranked = [...items].sort((a, b) => (b.score ?? 0.5) - (a.score ?? 0.5) || (b.image ? 1 : 0) - (a.image ? 1 : 0));
  const kept: { item: BriefSectionItem; tokens: Set<string> }[] = [];
  const seenUrls = new Set<string>();
  for (const it of ranked) {
    if (it.url && seenUrls.has(it.url)) continue;
    const toks = normTokens(it.title);
    if (kept.some((k) => jaccard(k.tokens, toks) > 0.55)) continue; // same story, different scout
    if (it.url) seenUrls.add(it.url);
    kept.push({ item: it, tokens: toks });
  }
  return kept.map((k) => k.item);
}

// Proper-noun "entity" tokens from a title, in title order (the subject usually
// leads). Catches company names incl. digit-led ones like "4baseCare".
const ENTITY_STOP = new Set([
  "the", "this", "that", "these", "those", "new", "how", "why", "what", "when", "your", "with",
  "from", "into", "over", "under", "and", "for", "its", "ceo", "cto", "ai", "llm", "gpu", "api",
  "app", "data", "tech", "news", "report", "study", "first", "big", "top", "best", "us", "uk", "eu",
]);
function entityTokensOrdered(title: string): string[] {
  const matches = title.match(/\b([A-Z][A-Za-z0-9&.]{2,}|[0-9]+[A-Za-z][A-Za-z0-9]+)\b/g) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    const t = m.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (t.length >= 3 && !ENTITY_STOP.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

// One item per ENTITY: collapse multiple articles about the same company/person
// (e.g. 3 separate 4baseCare stories) into the single highest-scored one. Distinct
// items then backfill the freed slots in capForReadability, keeping breadth.
function dedupeByEntity(items: BriefSectionItem[]): BriefSectionItem[] {
  const ranked = [...items].sort((a, b) => (b.score ?? 0.5) - (a.score ?? 0.5) || (b.image ? 1 : 0) - (a.image ? 1 : 0));
  const kept: { item: BriefSectionItem; primary?: string; titleLc: string }[] = [];
  for (const it of ranked) {
    const primary = entityTokensOrdered(it.title)[0];
    const titleLc = it.title.toLowerCase();
    // conflict if same primary entity, or THIS title names an already-kept entity
    // (a later article about the same company carries that company in its own title).
    // We deliberately don't collapse on a kept title merely *mentioning* this item's
    // entity — that would drop a distinct story over a passing mention.
    const dup = primary && kept.some((k) => k.primary && (k.primary === primary || titleLc.includes(k.primary)));
    if (dup) continue;
    kept.push({ item: it, primary, titleLc });
  }
  return kept.map((k) => k.item);
}

// Cap total items, but keep variety so the top isn't all one theme.
function capForReadability(items: BriefSectionItem[], max: number): BriefSectionItem[] {
  if (items.length <= max) return items;
  const out: BriefSectionItem[] = [];
  const perTag = new Map<string, number>();
  // First pass: at most 4 per sourceTag, in score order, to force diversity.
  for (const it of items) {
    const tag = it.sourceTag ?? "";
    const n = perTag.get(tag) ?? 0;
    if (n < 4) {
      out.push(it);
      perTag.set(tag, n + 1);
    }
    if (out.length >= max) return out;
  }
  // Backfill with the rest by score until we hit max.
  for (const it of items) {
    if (out.length >= max) break;
    if (!out.includes(it)) out.push(it);
  }
  return out.slice(0, max);
}

function dedupeActions(actions: ActionItem[]): ActionItem[] {
  const seen = new Set<string>();
  const out: ActionItem[] = [];
  for (const a of actions) {
    const key = `${a.kind}:${(a.who ?? a.reason).toLowerCase().slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

// ── interest mining (reads texts + our chats, extracts threads to track) ──────
async function mineInterests(worker: Agent): Promise<void> {
  const texts = await readImessage.execute(
    { sinceHours: 72, direction: "both", max: 60 } as never,
    { runId: "mine", emit: () => {} },
  );
  const textCorpus = (texts.signals ?? []).map((s) => s.body).join("\n").slice(0, 6000);
  const chatRows = db.prepare(`SELECT content FROM messages WHERE role = 'user' ORDER BY ts DESC LIMIT 30`).all() as { content: string }[];
  const chatCorpus = chatRows.map((r) => r.content).join("\n").slice(0, 3000);
  if (!textCorpus && !chatCorpus) return;

  const out = await runWorkerText(
    worker,
    `From the user's recent texts and chats, extract 3-6 specific INTELLECTUAL/PROFESSIONAL/ACADEMIC threads worth pulling news or info on tomorrow (concrete companies, technologies, research topics, courses, people). Ignore pure social/logistics chatter. Each should read as a good search query. Return ONLY a JSON array of short strings.`,
    `Texts:\n${textCorpus}\n\nChats:\n${chatCorpus}`,
  );
  for (const topic of safeJsonArray<string>(out)) if (typeof topic === "string") upsertInterest(topic, "text");
}

function topInterests(limit: number): string[] {
  return (db.prepare(`SELECT topic FROM interests ORDER BY weight DESC, last_seen DESC LIMIT ?`).all(limit) as { topic: string }[]).map((r) => r.topic);
}
function upsertInterest(topic: string, source: string) {
  const t = topic.trim().slice(0, 80);
  if (!t) return;
  db.prepare(
    `INSERT INTO interests (topic, source, weight, last_seen) VALUES (?, ?, 1, ?)
     ON CONFLICT(topic) DO UPDATE SET weight = weight + 1, last_seen = excluded.last_seen, source = excluded.source`,
  ).run(t, source, now());
}

// ── helper: one-shot worker text (no tools) for mining ────────────────────────
async function runWorkerText(worker: Agent, system: string, prompt: string, timeoutMs = 120_000): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await worker.run({
      runId: nanoid(8),
      system,
      prompt,
      history: [],
      toolSpecs: [],
      callTool: async () => ({ ok: false, data: null, error: "no tools" }),
      emit: () => {},
      signal: ac.signal,
      model: config.model,
      maxTurns: 1,
    });
    return res.text;
  } finally {
    clearTimeout(timer);
  }
}

// ── json helpers ──────────────────────────────────────────────────────────────
interface RawItem { title?: string; summary?: string; whyItMatters?: string; score?: number; url?: string }
interface RawAction { kind?: ActionItem["kind"]; who?: string; org?: string; orgDomain?: string; reason?: string; suggestedChannel?: string; subject?: string; draftBody?: string; url?: string; sourceSignalIds?: string[] }

function safeJsonArray<T>(s: string): T[] {
  const m = s.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    return JSON.parse(m[0]) as T[];
  } catch {
    return [];
  }
}
function safeJsonObject<T>(s: string): T | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

export function latestBrief(): Brief | null {
  const row = db.prepare(`SELECT payload FROM briefs ORDER BY generated_at DESC LIMIT 1`).get() as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as Brief) : null;
}
