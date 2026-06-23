import { describe, it, expect } from "vitest";
import { isExpectedAbort, handleProcessError } from "../src/lib/processGuard.js";

// The 2026-06-22 crash-loop fix: the harness must survive the agent-sdk's expected
// AbortError WITHOUT spamming the log, but a REAL error must still surface loudly
// (no blanket-swallow).
describe("processGuard — quiet the expected abort, keep real errors loud", () => {
  it("classifies the agent-sdk AbortError as expected", () => {
    const e = new Error("Operation aborted");
    e.name = "AbortError";
    expect(isExpectedAbort(e)).toBe(true);
  });

  it("does NOT misclassify real errors / odd reasons as aborts", () => {
    expect(isExpectedAbort(new Error("boom"))).toBe(false);
    expect(isExpectedAbort("some string reason")).toBe(false);
    expect(isExpectedAbort(null)).toBe(false);
    expect(isExpectedAbort(undefined)).toBe(false);
    expect(isExpectedAbort({ name: "TypeError" })).toBe(false);
  });

  it("swallows the expected AbortError quietly (nothing logged)", () => {
    const calls: unknown[][] = [];
    const e = new Error("Operation aborted");
    e.name = "AbortError";
    handleProcessError("unhandledRejection", e, { error: (...a) => calls.push(a) });
    expect(calls).toHaveLength(0);
  });

  it("STILL logs a real rejection at full volume (no blanket-swallow)", () => {
    const calls: unknown[][] = [];
    handleProcessError("unhandledRejection", new Error("a real bug"), { error: (...a) => calls.push(a) });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.join(" ")).toContain("harness kept alive");
    expect(String(calls[0]![1])).toContain("a real bug");
  });
});
