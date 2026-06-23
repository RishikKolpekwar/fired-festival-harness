// ─────────────────────────────────────────────────────────────────────────────
// PILLAR 2 — MATERIAL HANDLING (registry + guardrail-wrapped dispatch)
// The worker never executes a tool directly. It asks the harness, which runs:
//   action-guardrail → execute → persist signals → trace → output accounting.
// This dispatch is worker-agnostic, so any swapped-in worker reuses every pillar.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../db.js";
import { actionGuardrails } from "./guardrails.js";
import { autoSendEnabled } from "../settings.js";
import type { Observability } from "./observability.js";
import type { EmitFn, Signal, Tool, ToolResult } from "./types.js";

import { searchNews } from "../tools/news.js";
import { fetchRss } from "../tools/rss.js";
import { searchJobs } from "../tools/jobs.js";
import { readImessage } from "../tools/imessage.js";
import { readGmail } from "../tools/gmail.js";
import { readCalendar } from "../tools/calendar.js";
import { draftImessage, sendImessageTool } from "../tools/messaging.js";
import { fetchUrl } from "../tools/web.js";
import { draftEmail } from "../tools/email.js";
import { findEmail } from "../tools/emailFinder.js";
import { addOutreach } from "../tools/outreach.js";
import { addTodoTool, listTodosTool, completeTodoTool } from "../tools/todos.js";
import { rememberTool, recallTool, lookupContactTool } from "../tools/memory.js";
import { findFileTool, shareFileTool } from "../tools/drive.js";
import { connectServiceTool, callApiTool, listServicesTool } from "../tools/services.js";

// The registered tool set (material handling surface).
export const REGISTRY: Record<string, Tool<any, any>> = {
  [searchNews.name]: searchNews,
  [fetchRss.name]: fetchRss,
  [searchJobs.name]: searchJobs,
  [readImessage.name]: readImessage,
  [readGmail.name]: readGmail,
  [readCalendar.name]: readCalendar,
  [fetchUrl.name]: fetchUrl,
  [draftImessage.name]: draftImessage,
  [sendImessageTool.name]: sendImessageTool,
  [draftEmail.name]: draftEmail,
  [findEmail.name]: findEmail,
  [addOutreach.name]: addOutreach,
  [addTodoTool.name]: addTodoTool,
  [listTodosTool.name]: listTodosTool,
  [completeTodoTool.name]: completeTodoTool,
  [rememberTool.name]: rememberTool,
  [recallTool.name]: recallTool,
  [lookupContactTool.name]: lookupContactTool,
  [findFileTool.name]: findFileTool,
  [shareFileTool.name]: shareFileTool,
  [connectServiceTool.name]: connectServiceTool,
  [callApiTool.name]: callApiTool,
  [listServicesTool.name]: listServicesTool,
};

export function listTools(): Tool[] {
  return Object.values(REGISTRY);
}

export interface DispatchState {
  runId: string;
  emit: EmitFn;
  obs: Observability;
  approvalToken?: string;
  enrichmentCount: number;
}

/**
 * Run one tool call through the full harness pipeline. Returns the ToolResult.
 * Errors are returned as data (result.ok=false) — never thrown into the worker.
 */
export async function dispatch(
  toolName: string,
  args: Record<string, unknown>,
  state: DispatchState,
): Promise<ToolResult> {
  const statusId = `${toolName}-${Date.now()}`;
  const tool = REGISTRY[toolName];

  // Unknown tool → action guardrail handles it uniformly below, but guard first.
  if (!tool) {
    state.obs.alarm("GUARDRAIL_VIOLATION", `Worker requested unknown tool "${toolName}".`);
    return { ok: false, data: null, error: `unknown tool: ${toolName}` };
  }

  // ── ACTION GUARDRAIL ──────────────────────────────────────────────────────
  const decision = actionGuardrails(tool, {
    approvalToken: state.approvalToken,
    enrichmentCount: state.enrichmentCount,
    autoSend: autoSendEnabled(),
  });
  if (!decision.allow) {
    if (decision.alarm) {
      state.obs.alarm(decision.alarm.type, decision.alarm.context, {
        severity: decision.alarm.severity,
        recommendedAction: decision.alarm.recommendedAction,
      });
    }
    return { ok: false, data: null, error: `blocked by ${decision.rule}: ${decision.reason}` };
  }

  // ── EXECUTE (traced) ──────────────────────────────────────────────────────
  state.emit({ kind: "status", id: statusId, label: statusLabel(toolName, args), tool: toolName, state: "start" });
  if (toolName === "enrich_contact") state.enrichmentCount += 1;

  const result = await state.obs.span(`tool.${toolName}`, { tool: toolName, effect: tool.effect }, () =>
    tool.execute(args as any, { runId: state.runId, emit: state.emit, approvalToken: state.approvalToken }),
  );

  // ── MATERIAL ACCOUNTING — persist normalized signals ──────────────────────
  if (result.signals?.length) persistSignals(state.runId, result.signals);

  // ── A failed read source is a degraded source, not a crash ────────────────
  if (!result.ok && tool.effect === "read") {
    state.obs.alarm("SOURCE_DEGRADED", `${toolName} failed: ${result.error ?? "unknown"}`);
  }

  state.emit({
    kind: "status",
    id: statusId,
    label: statusLabel(toolName, args),
    tool: toolName,
    state: result.ok ? "done" : "error",
  });
  return result;
}

function persistSignals(runId: string, signals: Signal[]) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO signals (id, run_id, source, title, body, url, ts, relevance, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((rows: Signal[]) => {
    for (const s of rows)
      stmt.run(s.id, runId, s.source, s.title, s.body, s.url ?? null, s.ts, s.relevance ?? null, s.meta ? JSON.stringify(s.meta) : null);
  });
  tx(signals);
}

// Human-friendly status line for the UI ("searching news…").
function statusLabel(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "search_news":
      return `searching news for "${String(args.query ?? "").slice(0, 40)}"…`;
    case "fetch_rss":
      return "checking RSS feeds (20VC, Substack)…";
    case "search_jobs":
      return "scanning job boards…";
    case "read_imessage":
      return "reading recent messages…";
    case "read_gmail":
      return "reading recent email…";
    case "read_calendar":
      return "checking your calendar…";
    default:
      return `running ${tool}…`;
  }
}
