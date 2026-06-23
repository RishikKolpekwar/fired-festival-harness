// Mirror of the shared API_CONTRACT.md "Core data types".
// Keep this in sync with the contract — the backend is the source of truth.

export type Signal = {
  id: string;
  source: "news" | "rss" | "jobs" | "imessage" | "gmail" | "calendar";
  title: string;
  body: string;
  url?: string;
  ts: string; // ISO
  relevance?: number; // 0..1
  meta?: Record<string, unknown>;
};

export type AlarmType =
  | "SOURCE_DEGRADED"
  | "LOW_SIGNAL"
  | "HALLUCINATION_DETECTED"
  | "STALE_CONTACT"
  | "APPROVAL_PENDING"
  | "GUARDRAIL_VIOLATION"
  | "TURN_LIMIT_REACHED"
  | "COST_CEILING_HIT";

export type AlarmSeverity = "low" | "medium" | "high" | "critical";

export type Alarm = {
  type: AlarmType;
  severity: AlarmSeverity;
  context: string;
  recommendedAction: string;
  ts: string;
};

export type ActionItem = {
  id: string;
  kind: "email" | "job" | "follow_up";
  who?: string;
  org?: string;
  orgDomain?: string;
  reason: string;
  suggestedChannel?: string;
  subject?: string;
  email?: string; // resolved recipient address, when the finder has one
  draftOpener?: string;
  url?: string;
  sourceSignalIds: string[];
};

export type BriefItem = {
  title: string;
  summary: string;
  url?: string;
  flagged?: boolean;
  // newer backend fields
  image?: string;
  whyItMatters?: string;
  score?: number;
  sourceTag?: string;
};

export type BriefSection = {
  heading: string;
  items: BriefItem[];
};

export type Brief = {
  id: string;
  generatedAt: string;
  topline?: string;
  // new flat shape (preferred); sections is the legacy grouped shape
  items?: BriefItem[];
  sections?: BriefSection[];
  actions: ActionItem[];
  todos?: BriefTodo[];
  citedSources: { id: string; url?: string; source: string }[];
};

export type BriefTodo = {
  id: string;
  title: string;
  detail?: string;
  tag?: string;
  dueDate?: string; // YYYY-MM-DD; dated todos surface near their due date
};

export type Thread = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
};

// ---- Follow-ups (cross-source command board) ----
export type FollowUpChannel =
  | "email"
  | "imessage"
  | "pipeline"
  | "todo"
  | "brief"
  | "calendar";

export type FollowUpColumn =
  | "needs_you"
  | "awaiting_them"
  | "warm"
  | "scheduled"
  | "cold";

export type FollowUpItem = {
  id: string;
  who: string;
  org?: string;
  channel: FollowUpChannel;
  pending: string; // the open loop / what's owed
  lastTouch?: string; // ISO date of last contact, if known
  stalenessDays: number; // computed
  suggestedAction: string; // the 1-tap next step
  priority: number; // 0-100 rank score (computed)
  column: FollowUpColumn; // computed
  sourceRef?: string; // deep link / id back to the thread/email/row
  entity?: string; // engram entity key (person:x / project:x) for the graph
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: string;
  usedTools?: string[];
};

export type Health = {
  ok: boolean;
  model: string;
  lastBriefAt: string | null;
  sources: Record<string, "ok" | "degraded">;
};

// ---- SSE event payloads (POST /api/chat, POST /api/brief/generate) ----

export type StatusEvent = {
  id: string;
  label: string;
  tool: string;
  state: "start" | "done" | "error";
};

export type TokenEvent = { text: string };

export type CheckpointEvent = {
  stage: string;
  status: "pass" | "fail";
};

export type CanvasEvent = {
  kind: "brief" | "pipeline";
  payload: Brief | unknown;
};

export type DoneEvent = {
  threadId: string;
  messageId: string;
  usedTools: string[];
  usage: { inputTokens: number; outputTokens: number };
};

export type ErrorEvent = { message: string };
