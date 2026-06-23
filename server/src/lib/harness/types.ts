// Core harness types — shared across all four pillars and the worker.
// Mirrors the shapes in /API_CONTRACT.md so the HTTP layer is a thin mapping.

// ─────────────────────────────────────────────────────────────────────────────
// Material handling (pillar 2): everything the harness pulls is normalized to a
// Signal before the worker ever sees it.
// ─────────────────────────────────────────────────────────────────────────────
export type SourceKind =
  | "news"
  | "rss"
  | "jobs"
  | "imessage"
  | "gmail"
  | "calendar";

export interface Signal {
  id: string;
  source: SourceKind;
  title: string;
  body: string;
  url?: string;
  ts: string; // ISO 8601
  relevance?: number; // 0..1, set by the scorer
  meta?: Record<string, unknown>;
}

// Every tool returns this contract — errors come back as data, never thrown.
export interface ToolResult<T = unknown> {
  ok: boolean;
  data: T;
  error: string | null;
  /** Normalized signals this tool produced (for material-handling accounting). */
  signals?: Signal[];
  /** Full text to hand the model verbatim (e.g. a fetched page / JD), bypassing the signal-summary truncation. */
  modelText?: string;
  /** Token-ish size after truncation, for budget accounting. */
  truncated?: boolean;
}

// A registered tool: schema (what the model reads) + executor (real code) +
// the result contract above. This is the unit of "material handling".
export interface Tool<Args = Record<string, unknown>, Out = unknown> {
  name: string;
  description: string;
  /** JSON-schema-ish parameter spec the worker reads to decide how to call it. */
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  /** Side-effect class — drives action-guardrail decisions. */
  effect: "read" | "write" | "send";
  execute: (args: Args, ctx: ToolContext) => Promise<ToolResult<Out>>;
}

export interface ToolContext {
  runId: string;
  emit: EmitFn;
  /** Approval token presented by the caller, gating `send` tools. */
  approvalToken?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardrails (pillar 3): declared, not implicit. A decision is the output of
// evaluating one layer.
// ─────────────────────────────────────────────────────────────────────────────
export type GuardrailLayer = "input" | "action" | "output";

export interface GuardrailDecision {
  allow: boolean;
  /** Name of the specific declared rule that fired. */
  rule: string;
  layer: GuardrailLayer;
  reason: string;
  /** If the guardrail wants an alarm raised. */
  alarm?: Omit<Alarm, "ts">;
  /** Optionally rewrite/strip the payload (e.g. drop unsourced claims). */
  mutated?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability (pillar 4): checkpoints + structured alarms + traces.
// ─────────────────────────────────────────────────────────────────────────────
export type CheckpointStage =
  | "AGENT_DISPATCH"
  | "SOURCE_FETCH"
  | "RELEVANCE_SCORE"
  | "CALENDAR_CONTEXT"
  | "BRIEF_GENERATION"
  | "ACTION_EXTRACT"
  | "DELIVER"
  | "CHAT_TURN";

export interface Checkpoint {
  runId: string;
  stage: CheckpointStage;
  status: "pass" | "fail";
  ts: string;
  /** Persisted payload so a run can be replayed from this stage forward. */
  payload?: unknown;
}

export type AlarmType =
  | "SOURCE_DEGRADED"
  | "LOW_SIGNAL"
  | "EMPTY_BRIEF"
  | "HALLUCINATION_DETECTED"
  | "STALE_CONTACT"
  | "APPROVAL_PENDING"
  | "GUARDRAIL_VIOLATION"
  | "TURN_LIMIT_REACHED"
  | "COST_CEILING_HIT";

export type Severity = "low" | "medium" | "high" | "critical";

export interface Alarm {
  type: AlarmType;
  severity: Severity;
  context: string;
  recommendedAction: string;
  ts: string;
}

export interface TraceSpan {
  runId: string;
  name: string; // e.g. "llm.call", "tool.search_news"
  startedAt: string;
  endedAt?: string;
  attributes: Record<string, string | number | boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker (swappable): the only thing the harness asks of an agent.
// ─────────────────────────────────────────────────────────────────────────────
export interface AgentInput {
  runId: string;
  /** System framing assembled by the harness. */
  system: string;
  /** The user's message / task. */
  prompt: string;
  /** Prior turns for context. */
  history: { role: "user" | "assistant"; content: string }[];
  /** Tool *specs* the worker exposes to the model (schema only). */
  toolSpecs: Tool[];
  /**
   * The ONLY way the worker runs a tool. Already wrapped by the harness with
   * action-guardrails + observability + material accounting. The worker never
   * touches a tool executor directly — this is what keeps the pillars separate.
   */
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  emit: EmitFn;
  /** Harness-owned cancellation (wall-clock timeout / cost ceiling). */
  signal: AbortSignal;
  model: string;
  maxTurns: number;
}

export interface AgentOutput {
  text: string;
  usedTools: string[];
  citedSources: { id: string; url?: string; source: SourceKind }[];
  usage: { inputTokens: number; outputTokens: number };
}

/** A swappable worker. Drop-in replacement requires no harness change. */
export interface Agent {
  id: string;
  run(input: AgentInput): Promise<AgentOutput>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event stream — the harness emits these; the HTTP layer maps them to SSE.
// ─────────────────────────────────────────────────────────────────────────────
export type HarnessEvent =
  | { kind: "status"; id: string; label: string; tool: string; state: "start" | "done" | "error" }
  | { kind: "token"; text: string }
  | { kind: "checkpoint"; stage: CheckpointStage; status: "pass" | "fail" }
  | { kind: "alarm"; alarm: Alarm }
  | { kind: "canvas"; canvasKind: "brief" | "pipeline"; payload: unknown }
  | { kind: "approval"; draftId: string; channel: "imessage" | "email"; to: string; body: string }
  | { kind: "done"; threadId: string; messageId: string; usedTools: string[]; usage: { inputTokens: number; outputTokens: number } }
  | { kind: "error"; message: string };

export type EmitFn = (event: HarnessEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Brief / action types (mirror API_CONTRACT).
// ─────────────────────────────────────────────────────────────────────────────
export interface ActionItem {
  id: string;
  kind: "email" | "job" | "follow_up";
  who?: string;
  /** Company/org of the contact (for email actions). */
  org?: string;
  /** The org's website domain (e.g. 'leicabiosystems.com') — used to find a cold email via Apify. */
  orgDomain?: string;
  reason: string;
  suggestedChannel?: string;
  /** For email actions: a short, specific subject line (not the first line of the body). */
  subject?: string;
  /** For email/text: a ready-to-send message body. For jobs: the full application kit (cover note + answers). */
  draftOpener?: string;
  /** Apply link (jobs) or relevant URL. */
  url?: string;
  sourceSignalIds: string[];
}

export interface BriefSectionItem {
  title: string;
  summary: string; // 2-3 sentence digest of the actual content
  whyItMatters: string; // REQUIRED: how it connects to the user — render this prominently
  url?: string;
  image?: string; // a real article/photo image URL (not a site icon)
  score?: number; // 0..1 importance to the user today (drives feed ordering)
  sourceTag?: string; // small optional label (e.g. "pathology ai") — a chip, NOT a section
  flagged?: boolean;
}

export interface Brief {
  id: string;
  generatedAt: string;
  topline?: string; // editor's note: what actually matters today, in the user's voice
  /** PRIMARY: one flat feed, ranked most-relevant-first. No topic sections. */
  items: BriefSectionItem[];
  actions: ActionItem[];
  /** Open personal todos / projects, resurfaced until marked done. */
  todos?: BriefTodo[];
  citedSources: { id: string; title?: string; url?: string; source: SourceKind }[]; // footnote links only
}

export interface BriefTodo {
  id: string;
  title: string;
  detail?: string;
  tag?: string;
  dueDate?: string; // YYYY-MM-DD when this is a dated reminder (optional)
}
