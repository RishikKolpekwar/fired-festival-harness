// PILLAR 4 — OBSERVABILITY. Proves the rubric's explicit asks:
// checkpoints are "explicit pass/fail, persisted + replayable" and alarms are
// "structured type/severity/context/recommendedAction". Imports solo-builder's
// observability.ts read-only; writes land in the temp db from test/setup.ts.
import { describe, it, expect } from "vitest";
import { Observability, recentAlarms } from "../src/lib/harness/observability.js";
import { db } from "../src/lib/db.js";
import type { Alarm } from "../src/lib/harness/types.js";

const noop = () => {};

describe("checkpoints — persisted + replayable", () => {
  it("records pass/fail and persists a replayable payload", () => {
    const obs = new Observability("run-cp-1", noop);
    const cp = obs.checkpoint("SOURCE_FETCH", "pass", { signals: 12, kept: 9 });
    expect(cp.status).toBe("pass");

    const row = db
      .prepare("SELECT status, payload FROM checkpoints WHERE run_id = ? AND stage = ?")
      .get("run-cp-1", "SOURCE_FETCH") as { status: string; payload: string };
    expect(row.status).toBe("pass");

    // The whole point of the pillar: replay the exact persisted artifact.
    expect(Observability.loadCheckpoint("run-cp-1", "SOURCE_FETCH")).toEqual({ signals: 12, kept: 9 });
  });

  it("upserts on (run, stage) so a re-run overwrites rather than duplicates", () => {
    const obs = new Observability("run-cp-2", noop);
    obs.checkpoint("RELEVANCE_SCORE", "fail", { reason: "low signal" });
    obs.checkpoint("RELEVANCE_SCORE", "pass", { reason: "recovered" });

    const rows = db
      .prepare("SELECT status FROM checkpoints WHERE run_id = ? AND stage = ?")
      .all("run-cp-2", "RELEVANCE_SCORE") as { status: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pass");
    expect(Observability.loadCheckpoint("run-cp-2", "RELEVANCE_SCORE")).toEqual({ reason: "recovered" });
  });

  it("returns null when replaying a stage that was never checkpointed", () => {
    expect(Observability.loadCheckpoint("run-cp-1", "DELIVER")).toBeNull();
  });
});

describe("alarms — structured type/severity/context/recommendedAction", () => {
  it("fills the declared default severity + recommendedAction for the type", () => {
    const obs = new Observability("run-al-1", noop);
    const a = obs.alarm("GUARDRAIL_VIOLATION", "worker tried a blocked tool");
    expect(a.type).toBe("GUARDRAIL_VIOLATION");
    expect(a.severity).toBe("critical");
    expect(a.context).toBe("worker tried a blocked tool");
    expect(a.recommendedAction).toBeTruthy();
    expect(a.ts).toBeTruthy();
  });

  it("honors explicit severity / action overrides", () => {
    const obs = new Observability("run-al-2", noop);
    const a = obs.alarm("LOW_SIGNAL", "thin tennis results", {
      severity: "high",
      recommendedAction: "widen the query",
    });
    expect(a.severity).toBe("high");
    expect(a.recommendedAction).toBe("widen the query");
  });

  it("persists alarms and recentAlarms reads them back with all four fields", () => {
    const obs = new Observability("run-al-3", noop);
    obs.alarm("SOURCE_DEGRADED", "exa returned nothing");
    obs.alarm("COST_CEILING_HIT", "run exceeded budget");

    const recent: Alarm[] = recentAlarms(10);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    for (const al of recent) {
      expect(al.type).toBeTruthy();
      expect(al.severity).toBeTruthy();
      expect(al.context).toBeTruthy();
      expect(al.recommendedAction).toBeTruthy();
    }
  });
});

describe("emit stream", () => {
  it("emits checkpoint and alarm events to the provided sink", () => {
    const events: { kind: string }[] = [];
    const obs = new Observability("run-emit", (e) => events.push(e));
    obs.checkpoint("AGENT_DISPATCH", "pass");
    obs.alarm("LOW_SIGNAL", "x");
    expect(events).toContainEqual({ kind: "checkpoint", stage: "AGENT_DISPATCH", status: "pass" });
    expect(events.some((e) => e.kind === "alarm")).toBe(true);
  });
});
