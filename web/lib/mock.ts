// Demo/mock data so the deployed UI is fully playable without a backend.
// Enabled when NEXT_PUBLIC_MOCK === "1" (set on the Vercel deployment).

import type {
  Alarm,
  Brief,
  BriefItem,
  FollowUpItem,
  Health,
  Message,
  Thread,
} from "./types";
import type { StreamHandlers } from "./sse";

export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const img = (seed: string) => `https://picsum.photos/seed/${seed}/1200/620`;

const ITEMS: BriefItem[] = [
  {
    title: "Leica, Indica Labs and Lunit team up to put AI biomarker scoring on the GT 450 scanner",
    summary:
      "The three are pairing the FDA-cleared Aperio GT 450 DX scanner with HALO AP DX and Lunit's biomarker models, so IHC scoring runs inside a clinical-grade, browser-based workflow. The pitch: move automated biomarker reads out of research and into routine diagnostics.",
    whyItMatters:
      "this is exactly the lane MedMorphIQ sits in, and it sets the bar your ER/PR work has to clear. read it before your next ESI or GKNM call.",
    url: "https://www.fiercebiotech.com/medtech",
    image: img("pathology-leica"),
    score: 0.96,
    sourceTag: "pathology ai",
  },
  {
    title: "ASCO study: an image-only model rivals genomic assays for HR+/HER2 grading",
    summary:
      "Researchers showed a model reading H&E images alone matched genomic recurrence tests for a large breast-cancer cohort, flagging low-confidence cases instead of forcing a call.",
    whyItMatters:
      "validation that morphology-first scoring can stand next to the expensive assays you're trying to undercut. good ammo for the MedMorphIQ deck.",
    url: "https://www.nature.com/subjects/cancer",
    image: img("asco-her2"),
    score: 0.91,
    sourceTag: "pathology ai",
  },
  {
    title: "Cadence ships a Level-5 autonomous chip-verification agent, 40x faster RTL validation",
    summary:
      "At COMPUTEX, Cadence unveiled a multi-agent verification system running on NVIDIA models inside its design suite, cutting RTL validation time dramatically.",
    whyItMatters:
      "your Intel internship, made commercial. the multi-agent DV pattern you're building is now shipping at the big EDA vendors, worth studying for your own framework.",
    url: "https://www.eetimes.com/",
    image: img("cadence-chip"),
    score: 0.88,
    sourceTag: "ai infra & chip",
  },
  {
    title: "Anthropic moves programmatic Claude usage onto a separate credit pool",
    summary:
      "Starting mid-June, API-style usage is metered off subscriptions onto a finite monthly credit pool at list prices, with recursive sub-agents and a fallback model in the Agent SDK.",
    whyItMatters:
      "directly hits your harness budget. recursive sub-agents map onto your orchestrator, and the fallback model is a clean second-worker swap.",
    url: "https://www.anthropic.com/news",
    image: img("anthropic-credits"),
    score: 0.84,
    sourceTag: "ai infra & chip",
  },
  {
    title: "Magnetar to deploy hundreds of AI agents in place of equity research analysts",
    summary:
      "An $18B alternative manager is launching a fund built on coordinated agents doing the analyst work, a real test of multi-agent systems on live capital.",
    whyItMatters:
      "your DV-framework pattern transplanted onto Wall Street. relevant for the quant lane you've been tracking.",
    url: "https://www.hedgeweek.com/",
    image: img("magnetar-quant"),
    score: 0.79,
    sourceTag: "markets & quant",
  },
  {
    title: "BillionToOne opens a founding ML engineer role spanning diagnostics and infra",
    summary:
      "A cancer-diagnostics company is hiring an early ML engineer to own both the model and the deployment pipeline, the rare role hitting clinical AI and infra at once.",
    whyItMatters:
      "the one posting that touches both your lanes, and they named Claude in the stack. worth an application today.",
    url: "https://www.ycombinator.com/jobs",
    image: img("billiontoone-job"),
    score: 0.82,
    sourceTag: "jobs",
  },
  {
    title: "20VC: a breakdown of who's actually winning the inference-cost war",
    summary:
      "Harry Stebbings walks through the economics of serving frontier models, where margins are going, and which infra startups are positioned to capture them.",
    whyItMatters:
      "the cost curve that decides whether MedMorphIQ's per-seat pricing holds. queue it for the commute.",
    url: "https://www.20vc.com/",
    image: img("20vc-infra"),
    score: 0.71,
    sourceTag: "vc & startups",
  },
];

export const mockBrief: Brief = {
  id: "demo_brief",
  generatedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  topline:
    "two things land on your roadmap today. on the clinical side, Leica, Indica and Lunit are pushing AI biomarker scoring into routine diagnostics, and a new ASCO model grades HR+/HER2 from images alone. both set the bar your ER/PR work has to beat. on the build side, Cadence shipped a multi-agent verification agent and Anthropic split out a credit pool, which both map straight onto your harness. and one job worth your morning: a founding ML role at BillionToOne that hits clinical AI and infra at once.",
  items: ITEMS,
  actions: [
    {
      id: "act_1",
      kind: "follow_up",
      who: "Dr. Maya Chen (Northwind Pathology Lab)",
      reason:
        "you met at the digital pathology meetup last week; it's been 8 days with no reply.",
      suggestedChannel: "email",
      draftOpener:
        "hey Maya, great chatting last week. quick follow-up: I'd love to compare notes on morphology-first biomarker scoring sometime this month.",
      sourceSignalIds: [],
    },
    {
      id: "act_2",
      kind: "email",
      who: "Jordan Vale (Helix Diagnostics)",
      reason:
        "today's biomarker-scoring news is a natural reason to reopen the thread from March.",
      suggestedChannel: "email",
      draftOpener:
        "hi Jordan, the biomarker-scoring announcement today got me thinking about where lower-cost grading fits. would love 20 minutes.",
      sourceSignalIds: [],
    },
    {
      id: "act_3",
      kind: "job",
      who: "Foundry Bio — founding ML engineer",
      reason: "rare role hitting both clinical AI and infra; matches your stack.",
      url: "https://www.ycombinator.com/jobs",
      sourceSignalIds: [],
    },
  ],
  citedSources: ITEMS.map((it, i) => ({
    id: `src_${i}`,
    url: it.url,
    source: it.sourceTag ?? "news",
  })),
};

export const mockHealth: Health = {
  ok: true,
  model: "claude-opus-4-8",
  lastBriefAt: mockBrief.generatedAt,
  sources: {
    news: "ok",
    rss: "ok",
    jobs: "ok",
    imessage: "ok",
    gmail: "ok",
    calendar: "ok",
  },
};

export const mockThreads: Thread[] = [
  {
    id: "th_1",
    title: "ER/PR pilot scope for Q3",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    preview: "what would a scoped ER/PR pilot look like…",
  },
  {
    id: "th_2",
    title: "Intel DV multi-agent framework notes",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    preview: "how should the supervisor route between…",
  },
];

export const mockAlarms: Alarm[] = [
  {
    type: "STALE_CONTACT",
    severity: "medium",
    context: "no touch with Gabriele Campanella in 8 days",
    recommendedAction: "surface a follow-up draft in outbound",
    ts: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    type: "LOW_SIGNAL",
    severity: "low",
    context: "quant feed returned only 1 item above threshold",
    recommendedAction: "broaden the query tomorrow",
    ts: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
];

export function mockThread(id: string) {
  const t = mockThreads.find((x) => x.id === id) ?? mockThreads[0];
  const messages: Message[] = [
    { id: "m1", role: "user", content: t.preview, ts: t.updatedAt },
    {
      id: "m2",
      role: "assistant",
      content:
        "Here's a quick take, grounded in your profile. (This is a demo thread — connect the harness backend for live answers.)",
      ts: t.updatedAt,
      usedTools: ["read_calendar", "search_news"],
    },
  ];
  return { id: t.id, title: t.title, messages };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simulate a streamed chat turn. */
export async function mockChat(message: string, h: StreamHandlers) {
  await sleep(300);
  h.onStatus?.({ id: "s1", label: "searching your sources…", tool: "search_news", state: "start" });
  await sleep(700);
  h.onStatus?.({ id: "s1", label: "searched news + rss", tool: "search_news", state: "done" });
  h.onStatus?.({ id: "s2", label: "reading recent context…", tool: "read_gmail", state: "start" });
  await sleep(600);
  h.onStatus?.({ id: "s2", label: "read 3 threads", tool: "read_gmail", state: "done" });

  const reply = `Good question. This is the **demo build** of Solo running with mock data, so I'm not hitting live sources — but here's how I'd handle "${message.slice(0, 80)}":\n\n- I'd pull from your news, RSS, jobs and inbox tools\n- score each item against your profile (pathology AI, AI infra, VC, quant)\n- and surface only what connects to MedMorphIQ or your Intel work.\n\nOpen the **Brief** tab to see a full example of the morning read. Connect the harness backend and this becomes live.`;

  const chunks = reply.match(/[\s\S]{1,18}/g) ?? [reply];
  for (const c of chunks) {
    h.onToken?.({ text: c });
    await sleep(28);
  }
  await sleep(150);
  h.onDone?.({
    threadId: "demo_thread",
    messageId: "demo_msg",
    usedTools: ["search_news", "read_gmail"],
    usage: { inputTokens: 1200, outputTokens: 180 },
  });
}

const daysAgoISO = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

// Demo follow-ups — generic contacts so the board is playable without a backend.
export const mockFollowUps: FollowUpItem[] = [
  {
    id: "fu_1",
    who: "Dr. Lena Hartmann",
    org: "Northwell Pathology",
    channel: "email",
    pending: "replied asking for the ER/PR validation deck — owed a response",
    lastTouch: daysAgoISO(2),
    stalenessDays: 2,
    suggestedAction: "send the validation deck + propose a 20-min call",
    priority: 96,
    column: "needs_you",
  },
  {
    id: "fu_2",
    who: "Marcus Vale",
    org: "Pantai Health (lead)",
    channel: "email",
    pending: "inbound demo request, unanswered",
    lastTouch: daysAgoISO(1),
    stalenessDays: 1,
    suggestedAction: "reply, qualify, book a demo",
    priority: 93,
    column: "needs_you",
  },
  {
    id: "fu_3",
    who: "Priya Nair",
    org: "cofounder candidate",
    channel: "imessage",
    pending: "you owe a reply on the equity-split thread",
    lastTouch: daysAgoISO(3),
    stalenessDays: 3,
    suggestedAction: "reply with your proposed split + next step",
    priority: 88,
    column: "needs_you",
  },
  {
    id: "fu_4",
    who: "Dr. Alan Pierce",
    org: "GKNM Coimbatore",
    channel: "pipeline",
    pending: "sent the pilot MOU 5 days ago, no reply",
    lastTouch: daysAgoISO(5),
    stalenessDays: 5,
    suggestedAction: "soft nudge on the MOU",
    priority: 74,
    column: "awaiting_them",
  },
  {
    id: "fu_5",
    who: "Sofia Reyes",
    org: "Lightspeed (assoc.)",
    channel: "email",
    pending: "intro request sent, awaiting reply",
    lastTouch: daysAgoISO(6),
    stalenessDays: 6,
    suggestedAction: "wait 2 more days, then follow up",
    priority: 61,
    column: "awaiting_them",
  },
  {
    id: "fu_6",
    who: "Prof. Gabriel Stein",
    org: "Mount Sinai",
    channel: "pipeline",
    pending: "good first meeting — keep warm",
    lastTouch: daysAgoISO(9),
    stalenessDays: 9,
    suggestedAction: "share the Q3 roadmap update",
    priority: 55,
    column: "warm",
  },
  {
    id: "fu_7",
    who: "Investor sync — A. Cho",
    org: "20VC network",
    channel: "calendar",
    pending: "call scheduled thu 10am",
    lastTouch: daysAgoISO(0),
    stalenessDays: 0,
    suggestedAction: "prep your ask + metrics one-pager",
    priority: 50,
    column: "scheduled",
  },
  {
    id: "fu_8",
    who: "Dr. Ramesh Iyer",
    org: "ESI Medical College",
    channel: "pipeline",
    pending: "no touch in 6 weeks — going cold",
    lastTouch: daysAgoISO(43),
    stalenessDays: 43,
    suggestedAction: "re-open with a relevant paper + a low-friction ask",
    priority: 34,
    column: "cold",
  },
];

/** Simulate brief generation ending in a canvas event. */
export async function mockBriefGenerate(h: StreamHandlers) {
  const stages = ["fetch", "score", "calendar", "generate", "actions", "deliver"];
  for (const stage of stages) {
    h.onCheckpoint?.({ stage, status: "pass" });
    await sleep(350);
  }
  h.onCanvas?.({ kind: "brief", payload: mockBrief });
  h.onDone?.({
    threadId: "demo_thread",
    messageId: "demo_brief_msg",
    usedTools: ["search_news", "fetch_rss", "search_jobs", "read_calendar"],
    usage: { inputTokens: 4200, outputTokens: 900 },
  });
}
