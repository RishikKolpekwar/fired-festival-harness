// ─────────────────────────────────────────────────────────────────────────────
// PILLAR 1 — THE LOOP (governance)
// The harness drives the worker inside hard, declared limits. The worker only
// reasons + asks for tools; the loop owns turn caps, wall-clock timeout, cost
// ceiling, tool dispatch wiring, persistence, and alarm escalation.
// ─────────────────────────────────────────────────────────────────────────────
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { config } from "../config.js";
import { loadProfile } from "../profile.js";
import { Observability } from "./observability.js";
import { dispatch, listTools, type DispatchState } from "./tools.js";
import { GUARDRAILS } from "./guardrails.js";
import { autoSendEnabled } from "../settings.js";
import { MaxTurnsError, BudgetError } from "../agents/claudeAgent.js";
import type { Agent, EmitFn, ToolResult } from "./types.js";

// Declared loop limits — the worker cannot override these. Task-sized and tunable
// via env so a heavy multi-step job (e.g. a batch of outreach emails) isn't killed
// by a chat-sized cap; the COST_CEILING is the ultimate runaway guard. When a cap
// is hit the loop winds down GRACEFULLY (persists + returns the partial work)
// rather than discarding everything — see runChat.
export const LOOP = {
  MAX_TURNS: Number(process.env.LOOP_MAX_TURNS ?? 30),
  WALL_CLOCK_MS: Number(process.env.LOOP_WALL_CLOCK_MS ?? 300_000),
  COST_CEILING_USD: GUARDRAILS.COST_CEILING_USD,
} as const;

const now = () => new Date().toISOString();

/** The user's LOCAL calendar day, human-readable. Uses the machine's timezone
 *  (Solo runs on the user's own Mac), so it follows them and never rolls forward
 *  to the UTC date the way toISOString() does in the evening. */
function localToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export interface RunChatArgs {
  threadId?: string;
  message: string;
  emit: EmitFn;
  worker: Agent;
  approvalToken?: string;
}

export async function runChat({ threadId, message, emit: rawEmit, worker, approvalToken }: RunChatArgs): Promise<void> {
  const runId = nanoid(12);

  // Capture streamed tokens as they arrive so a run that hits a cap can still
  // PERSIST + RETURN the partial answer instead of throwing all the work away.
  let partialText = "";
  const emit: EmitFn = (e) => {
    if (e.kind === "token") partialText += e.text;
    rawEmit(e);
  };

  const obs = new Observability(runId, emit);
  const tid = threadId ?? createThread(message);

  db.prepare(`INSERT INTO runs (id, kind, thread_id, started_at, status) VALUES (?, 'chat', ?, ?, 'running')`).run(
    runId,
    tid,
    now(),
  );
  saveMessage(tid, "user", message);

  // ── Wall-clock cap (pillar-1 limit) — graceful, not a hard discard ────────
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LOOP.WALL_CLOCK_MS);

  // ── Guardrail-wrapped tool execution handed to the worker ─────────────────
  const state: DispatchState = { runId, emit, obs, approvalToken, enrichmentCount: 0 };
  const callTool = (name: string, args: Record<string, unknown>): Promise<ToolResult> =>
    dispatch(name, args, state);

  // Persist whatever the worker produced (full OR partial) as the assistant turn.
  // A partial run is checkpointed + saved into history so the user can say
  // "continue" and the next turn resumes with the work so far in context.
  const persist = (
    text: string,
    usedTools: string[],
    usage: { inputTokens: number; outputTokens: number },
    status: "done" | "partial",
  ): void => {
    const body =
      status === "partial"
        ? `${text}\n\n[stopped at the loop ${ac.signal.aborted ? "time limit" : "step or budget cap"}. say "continue" and i'll pick up from here.]`
        : text;
    const messageId = saveMessage(tid, "assistant", body, usedTools);
    finishRun(runId, status);
    obs.checkpoint("CHAT_TURN", "pass", { status, usedTools, usage, partialChars: status === "partial" ? text.length : undefined });
    emit({ kind: "done", threadId: tid, messageId, usedTools, usage });
  };

  try {
    const output = await worker.run({
      runId,
      system: buildSystemPrompt(),
      prompt: message,
      history: loadHistory(tid),
      toolSpecs: listTools(),
      callTool,
      emit,
      signal: ac.signal,
      model: config.model,
      maxTurns: LOOP.MAX_TURNS,
    });

    // Cost ceiling check (post-hoc; the SDK also enforces its own budget).
    const estCost = estimateCostUsd(output.usage.inputTokens, output.usage.outputTokens);
    if (estCost > LOOP.COST_CEILING_USD) {
      obs.alarm("COST_CEILING_HIT", `Run cost ~$${estCost.toFixed(2)} exceeded ceiling $${LOOP.COST_CEILING_USD}.`);
    }

    if (output.text.trim()) {
      persist(output.text, output.usedTools, output.usage, "done");
    } else if (partialText.trim()) {
      // Worker ended without a final answer but streamed something → keep it.
      obs.alarm("TURN_LIMIT_REACHED", "Worker ended without a final answer; returned the streamed partial.", { severity: "medium" });
      persist(partialText, output.usedTools, output.usage, "partial");
    } else {
      persist("(no response)", output.usedTools, output.usage, "done");
    }
  } catch (err) {
    const capped = err instanceof MaxTurnsError || err instanceof BudgetError || ac.signal.aborted;
    const haveWork = partialText.trim().length > 0;
    if (err instanceof MaxTurnsError) {
      obs.alarm("TURN_LIMIT_REACHED", `Worker hit the ${LOOP.MAX_TURNS}-turn cap.`, { severity: haveWork ? "medium" : "high" });
    } else if (err instanceof BudgetError) {
      obs.alarm("COST_CEILING_HIT", `Worker exceeded budget ($${err.costUsd.toFixed(2)}).`);
    } else if (ac.signal.aborted) {
      obs.alarm("TURN_LIMIT_REACHED", `Run hit the wall-clock cap (${LOOP.WALL_CLOCK_MS / 1000}s).`, { severity: haveWork ? "medium" : "high" });
    }

    if (capped && haveWork) {
      // GRACEFUL WIND-DOWN: the cap fired but we have streamed work — persist and
      // return it (resumable) instead of discarding to an error.
      persist(partialText, [], { inputTokens: 0, outputTokens: 0 }, "partial");
    } else {
      obs.checkpoint("CHAT_TURN", "fail", { error: String(err) });
      finishRun(runId, "error");
      emit({ kind: "error", message: humanError(err) });
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Headless single-turn chat — runs the full harness loop (all tools, guardrails)
 * and returns the assistant text. Used by the iMessage bridge so the user can
 * drive the whole harness from their phone.
 */
/**
 * Resolve a stable per-chat `threadKey` (e.g. "telegram:<chatId>" /
 * "imessage:<handle>") to a PERSISTENT thread id, creating + remembering the
 * mapping (in the settings table) the first time. This is what makes the bridge
 * conversations multi-turn instead of stateless.
 */
function threadForKey(threadKey: string, firstMessage: string): string {
  const key = `chatthread:${threadKey}`;
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  if (row?.value && db.prepare(`SELECT 1 FROM threads WHERE id = ?`).get(row.value)) return row.value;
  const tid = createThread(firstMessage);
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, tid);
  return tid;
}

/**
 * Headless chat — runs the full harness loop (tools, guardrails, graceful
 * wind-down). Used by the Telegram + iMessage bridges. Pass a `threadKey` for a
 * STATEFUL conversation: it resolves a persistent thread, carries prior turns in
 * `history`, and saves this exchange — so multi-turn (ask → clarify → answer)
 * coheres. Omit it for a stateless one-off (legacy behavior).
 */
export async function chatOnce(message: string, worker: Agent, threadKey?: string): Promise<string> {
  const runId = nanoid(12);
  let partialText = "";
  const emit: EmitFn = (e) => {
    if (e.kind === "token") partialText += e.text;
  };
  const obs = new Observability(runId, emit);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LOOP.WALL_CLOCK_MS);
  const state: DispatchState = { runId, emit, obs, enrichmentCount: 0 };

  // Stateful when a chat key is supplied; resolve the thread + record the user turn FIRST
  // so loadHistory carries everything before this message.
  const tid = threadKey ? threadForKey(threadKey, message) : undefined;
  if (tid) {
    db.prepare(`INSERT INTO runs (id, kind, thread_id, started_at, status) VALUES (?, 'chat', ?, ?, 'running')`).run(runId, tid, now());
    saveMessage(tid, "user", message);
  }

  try {
    const out = await worker.run({
      runId,
      system: buildSystemPrompt(),
      prompt: message,
      history: tid ? loadHistory(tid) : [],
      toolSpecs: listTools(),
      callTool: (name, args) => dispatch(name, args, state),
      emit,
      signal: ac.signal,
      model: config.model,
      maxTurns: LOOP.MAX_TURNS,
    });
    const text = out.text || partialText || "(done)";
    if (tid) {
      saveMessage(tid, "assistant", text, out.usedTools);
      finishRun(runId, "done");
    }
    return text;
  } catch (err) {
    const capped = err instanceof MaxTurnsError || err instanceof BudgetError || ac.signal.aborted;
    // Graceful wind-down on the phone path too: return + persist the partial instead of an error.
    if (capped && partialText.trim()) {
      const text = `${partialText}\n\n(stopped early. text "continue" and i'll keep going.)`;
      if (tid) {
        saveMessage(tid, "assistant", text, []);
        finishRun(runId, "partial");
      }
      return text;
    }
    if (tid) finishRun(runId, "error");
    return "hit an error: " + humanError(err);
  } finally {
    clearTimeout(timer);
  }
}

// ── system prompt assembly (profile-aware) ───────────────────────────────────
function buildSystemPrompt(): string {
  const profile = loadProfile();
  const auto = autoSendEnabled();
  const sendingPolicy = auto
    ? "SENDING: auto-send is ON. When the user asks you to text someone or post in a group, call draft_imessage (with `contact` for a 1:1 or `group` for a group chat) and it SENDS IMMEDIATELY. You CAN send. Never tell the user you are unable to send or that they must approve — just do it and confirm it sent."
    : "SENDING: auto-send is OFF. draft_imessage queues a message and the user taps approve to send. Tell them it's queued for approval.";
  return [
    "You are Solo, a personal intelligence harness for the user described below.",
    `TODAY is ${localToday()} (the user's local date). Use THIS as "today" for any dateline, greeting, or "today's briefing is ..." phrasing. Never state a UTC date or roll the day forward.`,
    sendingPolicy,
    "To post in a group chat, call draft_imessage with the `group` parameter set to the group name (e.g. 'Tennis boys'). For a 1:1, use `contact`.",
    "OUTREACH THREAD CHECK (MANDATORY, do this FIRST): before drafting ANY outreach email or calling someone 'cold', you MUST call read_gmail to search for a prior thread — query their email, then their name, then their company (e.g. read_gmail 'hitesh@4basecare.com', then 'Hitesh', then '4baseCare'). Gmail search covers SENT mail, so this finds emails the user already sent. Then: if the user ALREADY emailed them and got NO reply → draft a SHORT FOLLOW-UP that references the prior note (do NOT send another intro). If they REPLIED → it's a warm thread, reference what was said. Only if there is genuinely no prior thread do you draft a fresh intro. NEVER declare someone cold or draft an intro without searching Gmail first.",
    "EMAIL ADDRESSES: draft_email resolves a recipient from the user's own Gmail history. For COLD contacts (never emailed), first try find_email with the company domain to discover a published address, then draft_email with what it returns. If neither finds a real address, NEVER invent or guess one. Say so plainly and ask the user for the address, or suggest LinkedIn instead.",
    "EMAIL WRITING: write cold emails like a sharp human, not an AI. 5 to 7 short sentences. Open by naming the ONE specific thing of theirs you saw (the real paper/result/launch). One or two lines on what the user is building that overlaps. One small concrete ask. Sign off just 'Rishik'. NEVER use ai-slop phrases: 'I came across', 'I hope this finds you well', 'really resonated', 'I would genuinely love', 'No pitch', 'Would you be open to', 'compare notes', 'touch base', 'pick your brain'. Specific beats flattering.",
    "TODOS: you have a persistent to-do store. When the user says 'add to my todo', 'remind me to', or names a task/project to track, call add_todo (use list_todos / complete_todo to read or close them). This is for ANY task or project; only people-to-contact go to add_outreach. Open todos resurface in the morning brief. You CAN store todos. NEVER tell the user there is no todo list or that a task does not fit your tools.",
    "MEMORY: you have a persistent memory. When the user states a durable personal fact ('my dad works at Dell', 'I'm allergic to penicillin'), call remember to store it. Before saying you don't know something personal, call recall to check what you've been told, AND call lookup_contact to read it off the person's macOS Contacts card (it returns company, job title, emails, phones). For questions like 'where does X work' or 'what's X's number', try lookup_contact and recall FIRST. Only after both come up empty do you say it isn't recorded anywhere, then offer to remember it if they tell you. NEVER claim you have no memory.",
    "Answer grounded ONLY in data you pull via tools and the user's profile. Do not invent people, companies, jobs, or news.",
    "When you reference a specific person, company, role, or article, it must come from a tool result in this run.",
    "INVESTIGATE, do not give up after one tool. You are an agent with a multi-step loop: chain tools to build context before answering. For a question about a PERSON, work the chain: (1) lookup_contact to resolve who they are and read their card (org, title, email, phone), (2) recall for anything the user told you about them, (3) read_imessage with the contact plus several synonym keywords to mine the full thread, (4) read_gmail / read_calendar if relevant.",
    "ESCALATE TO THE WEB when local sources don't answer it and the fact could be public (e.g. someone's job, company, background). First work out the person's real identity from the signals you have: their email handle, the user's own surname (family share it), city, school. Example: a contact saved as 'Dad' with email 'akolpekwar@gmail.com' and a user surnamed Kolpekwar means the dad's name is likely 'A. Kolpekwar' — a rare name worth searching. Then call search_news (it is full web search, not just news) for the name plus 'LinkedIn' or the likely field, and fetch_url the best hit to confirm. Match on corroborating details (location, family, field) before trusting a result; if you cannot confirm it is the right person, say what you found and ask the user to confirm rather than asserting it. Never state a guess as fact.",
    "Only conclude 'it isn't recorded anywhere and I couldn't find it online' after you have actually tried local sources AND a web search. Say which sources you checked.",
    "For questions about a person (what they said, what you know about them, their traits), call read_imessage with BOTH `contact` and a `search` of several synonym keywords so you scan their full history, not just recent messages. If the first search misses, try broader/different keywords before concluding you don't know.",
    "Be concise and direct. Lowercase for informal asides.",
    "HARD RULE: never use hyphens or dashes of any kind (-, –, —) in any message, draft, or prose. Rephrase instead.",
    "LINKS: when the user gives you a url to send, send it in ONE message with the FULL link exactly as given, character for character. Never split a link across two messages, never drop or alter any character (the no-hyphens rule does NOT apply to urls). One send, whole link.",
    "FILES / DRIVE: you CAN share the user's Google Drive files. When they say 'send/share my <doc> with <person> so they can edit/view', call share_file with the file name, the person, and canEdit (true for edit). It finds the doc, shares it, and returns a link. Then send that link to the person over iMessage (or email if they ask). Use find_file to locate a doc by name. NEVER say you can't access or share files.",
    "SELF EXTENSION: you CAN wire up new external API services. When the user says 'connect <service>, my key is <key>' (e.g. RocketReach, Hunter), call connect_service with the name, base_url, and api_key. Then call_api uses it. So you can gain new abilities like email lookup on the fly. NEVER tell the user you can't add API keys or third party integrations. Use list_services to see what's connected. Known setups: RocketReach base 'https://api.rocketreach.co/v2', auth_style 'header', auth_name 'Api-Key', email lookup via POST 'person/lookup'. Hunter base 'https://api.hunter.io/v2', auth_style 'query', auth_name 'api_key', finder via GET 'email-finder' with domain/first_name/last_name.",
    "Lead with what matters to the user; surface who they should contact and why when relevant.",
    "",
    "── USER PROFILE ──",
    profile,
  ].join("\n");
}

// ── persistence helpers ──────────────────────────────────────────────────────
function createThread(firstMessage: string): string {
  const id = nanoid(10);
  const title = firstMessage.slice(0, 60);
  db.prepare(`INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(id, title, now(), now());
  return id;
}

function saveMessage(threadId: string, role: "user" | "assistant", content: string, usedTools?: string[]): string {
  const id = nanoid(10);
  db.prepare(`INSERT INTO messages (id, thread_id, role, content, used_tools, ts) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    threadId,
    role,
    content,
    usedTools ? JSON.stringify(usedTools) : null,
    now(),
  );
  db.prepare(`UPDATE threads SET updated_at = ? WHERE id = ?`).run(now(), threadId);
  return id;
}

function loadHistory(threadId: string): { role: "user" | "assistant"; content: string }[] {
  const rows = db
    .prepare(`SELECT role, content FROM messages WHERE thread_id = ? ORDER BY ts ASC LIMIT 20`)
    .all(threadId) as { role: "user" | "assistant"; content: string }[];
  // drop the just-saved user message (it's passed as prompt)
  return rows.slice(0, -1);
}

function finishRun(runId: string, status: string) {
  db.prepare(`UPDATE runs SET ended_at = ?, status = ? WHERE id = ?`).run(now(), status, runId);
}

// Rough Sonnet 4.6 pricing for the ceiling check ($3/$15 per MTok).
function estimateCostUsd(inTok: number, outTok: number): number {
  return (inTok / 1_000_000) * 3 + (outTok / 1_000_000) * 15;
}

function humanError(err: unknown): string {
  const s = String(err);
  if (/authentication|oauth|unauthorized/i.test(s))
    return "Claude auth missing — run `claude setup-token` and put the token in server/.env (CLAUDE_CODE_OAUTH_TOKEN).";
  return s.slice(0, 300);
}
