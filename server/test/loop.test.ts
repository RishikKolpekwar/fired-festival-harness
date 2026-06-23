// PILLAR 1 — THE LOOP: graceful budget wind-down. When a cap fires mid-run the
// loop must PERSIST + RETURN the streamed partial (resumable) instead of throwing
// all the work away. Driven by a MockWorker (the swappable Agent interface), so
// no real model/network — proves the governance, not the model.
import { describe, it, expect } from "vitest";
import { runChat, chatOnce } from "../src/lib/harness/loop.js";
import { MaxTurnsError } from "../src/lib/agents/claudeAgent.js";
import { db } from "../src/lib/db.js";
import type { Agent, HarnessEvent } from "../src/lib/harness/types.js";

const PARTIAL = "here is the partial answer so far";

function mockWorker(mode: "complete" | "empty" | "maxturns" | "error", emitToken = true): Agent {
  return {
    id: `mock-${mode}`,
    async run(input) {
      if (emitToken) input.emit({ kind: "token", text: PARTIAL });
      if (mode === "maxturns") throw new MaxTurnsError();
      if (mode === "error") throw new Error("boom");
      return {
        text: mode === "empty" ? "" : "the final answer",
        usedTools: ["search_news"],
        citedSources: [],
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
}

const runStatus = (tid: string) =>
  (db.prepare("SELECT status FROM runs WHERE thread_id = ?").get(tid) as { status: string } | undefined)?.status;
const assistantMsg = (tid: string) =>
  (db.prepare("SELECT content FROM messages WHERE thread_id = ? AND role = 'assistant'").get(tid) as
    | { content: string }
    | undefined)?.content;

describe("runChat — graceful wind-down on a cap", () => {
  it("persists + returns the streamed partial when the turn cap fires (not an error)", async () => {
    const events: HarnessEvent[] = [];
    await runChat({ threadId: "t-partial", message: "do a heavy multi-step task", emit: (e) => events.push(e), worker: mockWorker("maxturns") });

    // graceful: a done event, NO error event
    expect(events.some((e) => e.kind === "error")).toBe(false);
    expect(events.some((e) => e.kind === "done")).toBe(true);
    // the partial work was saved + the run is marked partial (resumable)
    expect(runStatus("t-partial")).toBe("partial");
    expect(assistantMsg("t-partial")).toContain(PARTIAL);
    expect(assistantMsg("t-partial")).toContain("continue"); // the resume hint
  });

  it("completes normally with the worker's final text", async () => {
    await runChat({ threadId: "t-done", message: "hi", emit: () => {}, worker: mockWorker("complete") });
    expect(runStatus("t-done")).toBe("done");
    expect(assistantMsg("t-done")).toBe("the final answer");
  });

  it("returns the streamed partial even when the worker ends with no final text", async () => {
    await runChat({ threadId: "t-empty", message: "x", emit: () => {}, worker: mockWorker("empty") });
    expect(runStatus("t-empty")).toBe("partial");
    expect(assistantMsg("t-empty")).toContain(PARTIAL);
  });

  it("still errors when the worker throws with NO partial work to salvage", async () => {
    const events: HarnessEvent[] = [];
    await runChat({ threadId: "t-err", message: "x", emit: (e) => events.push(e), worker: mockWorker("error", false) });
    expect(runStatus("t-err")).toBe("error");
    expect(events.some((e) => e.kind === "error")).toBe(true);
  });
});

describe("chatOnce — graceful wind-down on the phone path", () => {
  it("returns the partial + a resume hint instead of an error string", async () => {
    const out = await chatOnce("heavy task", mockWorker("maxturns"));
    expect(out).toContain(PARTIAL);
    expect(out).toContain("continue");
  });

  it("returns a plain error when there's nothing to salvage", async () => {
    const out = await chatOnce("x", mockWorker("error", false));
    expect(out).toMatch(/error/i);
  });
});
