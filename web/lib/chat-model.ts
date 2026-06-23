// View-model the UI renders. The hook (use-harness) builds these from the
// REST + SSE wire types.

import type { Alarm, CheckpointEvent } from "./types";
import type { ToolLine } from "@/components/chat/tool-status";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: string;
  // assistant-only live state:
  streaming?: boolean;
  toolLines?: ToolLine[];
  checkpoints?: CheckpointEvent[];
  alarms?: Alarm[];
  usedTools?: string[];
  /** set when this assistant turn opened a canvas, so we can show a re-open chip */
  canvasKind?: "brief" | "pipeline";
  /** non-fatal note shown inline (e.g. transport error) */
  error?: string;
};

export function makeId(prefix = "m"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
