// ─────────────────────────────────────────────────────────────────────────────
// PILLAR 4 — OBSERVABILITY
// Checkpoints (replayable), structured alarms (type/severity/context/action),
// and trace spans. This module is the only place that writes run telemetry.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../db.js";
import type {
  Alarm,
  AlarmType,
  Checkpoint,
  CheckpointStage,
  EmitFn,
  Severity,
  TraceSpan,
} from "./types.js";

const now = () => new Date().toISOString();

// Recommended actions are declared per alarm type — not invented ad hoc.
const RECOMMENDED_ACTION: Record<AlarmType, string> = {
  SOURCE_DEGRADED: "Check the source's API key / network; the brief ran with reduced inputs.",
  LOW_SIGNAL: "Broaden the query terms or lower the relevance threshold for this topic.",
  EMPTY_BRIEF: "Generation returned 0 items; the previous brief was kept and a retry was scheduled.",
  HALLUCINATION_DETECTED: "Unsourced claim was stripped from output; re-run if the section looks thin.",
  STALE_CONTACT: "Surface this contact in the outbound queue for a follow-up.",
  APPROVAL_PENDING: "A draft has waited too long — review and approve/reject it.",
  GUARDRAIL_VIOLATION: "A blocked action was attempted; inspect the run trace before proceeding.",
  TURN_LIMIT_REACHED: "The worker hit the turn cap without finishing; escalate to a human.",
  COST_CEILING_HIT: "The run exceeded its budget and was paused; raise the ceiling or narrow scope.",
};

const DEFAULT_SEVERITY: Record<AlarmType, Severity> = {
  SOURCE_DEGRADED: "medium",
  LOW_SIGNAL: "low",
  EMPTY_BRIEF: "high",
  HALLUCINATION_DETECTED: "high",
  STALE_CONTACT: "medium",
  APPROVAL_PENDING: "low",
  GUARDRAIL_VIOLATION: "critical",
  TURN_LIMIT_REACHED: "high",
  COST_CEILING_HIT: "high",
};

export class Observability {
  constructor(
    private runId: string,
    private emit: EmitFn,
  ) {}

  /** Record a checkpoint and persist its replayable payload. Emits to the stream. */
  checkpoint(stage: CheckpointStage, status: "pass" | "fail", payload?: unknown): Checkpoint {
    const cp: Checkpoint = { runId: this.runId, stage, status, ts: now(), payload };
    db.prepare(
      `INSERT INTO checkpoints (run_id, stage, status, ts, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(run_id, stage) DO UPDATE SET status=excluded.status, ts=excluded.ts, payload=excluded.payload`,
    ).run(this.runId, stage, status, cp.ts, payload === undefined ? null : JSON.stringify(payload));
    this.emit({ kind: "checkpoint", stage, status });
    return cp;
  }

  /** Load a persisted checkpoint payload so a run can replay from this stage forward. */
  static loadCheckpoint(runId: string, stage: CheckpointStage): unknown | null {
    const row = db
      .prepare(`SELECT payload FROM checkpoints WHERE run_id = ? AND stage = ?`)
      .get(runId, stage) as { payload: string | null } | undefined;
    if (!row || row.payload == null) return null;
    return JSON.parse(row.payload);
  }

  /** Raise a structured alarm. type/severity/context/recommendedAction always present. */
  alarm(type: AlarmType, context: string, opts?: { severity?: Severity; recommendedAction?: string }): Alarm {
    const alarm: Alarm = {
      type,
      severity: opts?.severity ?? DEFAULT_SEVERITY[type],
      context,
      recommendedAction: opts?.recommendedAction ?? RECOMMENDED_ACTION[type],
      ts: now(),
    };
    db.prepare(
      `INSERT INTO alarms (run_id, type, severity, context, recommended_action, ts)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(this.runId, alarm.type, alarm.severity, alarm.context, alarm.recommendedAction, alarm.ts);
    this.emit({ kind: "alarm", alarm });
    return alarm;
  }

  /** Wrap an async unit of work in a trace span (latency + attributes). */
  async span<T>(name: string, attributes: TraceSpan["attributes"], fn: () => Promise<T>): Promise<T> {
    const startedAt = now();
    const info = db
      .prepare(`INSERT INTO traces (run_id, name, started_at, attributes) VALUES (?, ?, ?, ?)`)
      .run(this.runId, name, startedAt, JSON.stringify(attributes));
    try {
      const out = await fn();
      db.prepare(`UPDATE traces SET ended_at = ? WHERE id = ?`).run(now(), info.lastInsertRowid);
      return out;
    } catch (err) {
      db.prepare(`UPDATE traces SET ended_at = ?, attributes = ? WHERE id = ?`).run(
        now(),
        JSON.stringify({ ...attributes, error: String(err) }),
        info.lastInsertRowid,
      );
      throw err;
    }
  }
}

/** Read recent alarms (for the /api/alarms endpoint). */
export function recentAlarms(limit = 20): Alarm[] {
  const rows = db
    .prepare(`SELECT type, severity, context, recommended_action, ts FROM alarms ORDER BY ts DESC LIMIT ?`)
    .all(limit) as {
    type: AlarmType;
    severity: Severity;
    context: string;
    recommended_action: string;
    ts: string;
  }[];
  return rows.map((r) => ({
    type: r.type,
    severity: r.severity,
    context: r.context,
    recommendedAction: r.recommended_action,
    ts: r.ts,
  }));
}
