// PILLAR 2 — MATERIAL HANDLING (dispatch) + tool error handling.
// Proves the harness contract "errors come back as data (ok:false), never
// thrown into the worker" and that the guardrail-block / unknown-tool paths
// raise the right alarms. Imports dispatch read-only and exercises only the
// NON-executing paths (unknown tool + blocked send) so no real network/IO tool
// ever runs — the suite stays hermetic.
import { describe, it, expect } from "vitest";
import { dispatch, type DispatchState } from "../src/lib/harness/tools.js";
import { Observability } from "../src/lib/harness/observability.js";
import type { HarnessEvent } from "../src/lib/harness/types.js";

function mkState(runId: string): { state: DispatchState; events: HarnessEvent[] } {
  const events: HarnessEvent[] = [];
  const emit = (e: HarnessEvent) => events.push(e);
  return { events, state: { runId, emit, obs: new Observability(runId, emit), enrichmentCount: 0 } };
}

const hadAlarm = (events: HarnessEvent[], type: string) =>
  events.some((e) => e.kind === "alarm" && e.alarm.type === type);

describe("dispatch — tool error handling (errors as data, never thrown)", () => {
  it("returns ok:false for an unknown tool and raises a GUARDRAIL_VIOLATION", async () => {
    const { state, events } = mkState("run-tool-1");
    const res = await dispatch("definitely_not_a_tool", {}, state);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown tool/i);
    expect(hadAlarm(events, "GUARDRAIL_VIOLATION")).toBe(true);
  });

  it("blocks a send-effect tool without approval — ok:false, nothing sent", async () => {
    const { state, events } = mkState("run-tool-2");
    const res = await dispatch("send_imessage", { to: "+15125550123", body: "hi" }, state);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/NO_SEND_WITHOUT_APPROVAL/);
    expect(hadAlarm(events, "GUARDRAIL_VIOLATION")).toBe(true);
  });

  it("never throws — a failed dispatch resolves as ToolResult data", async () => {
    const { state } = mkState("run-tool-3");
    await expect(dispatch("nope", {}, state)).resolves.toMatchObject({ ok: false });
  });
});
