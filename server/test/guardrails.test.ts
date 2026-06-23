// PILLAR 3 — GUARDRAILS. Proves the declared rules block/allow as written.
// Pure functions, no db, no network — imports solo-builder's guardrails.ts read-only.
import { describe, it, expect } from "vitest";
import {
  GUARDRAILS,
  actionGuardrails,
  inputGuardrails,
  isAllowedSource,
  outputGuardrails,
  type ActionContext,
} from "../src/lib/harness/guardrails.js";
import type { Signal, Tool } from "../src/lib/harness/types.js";

const tool = (name: string, effect: Tool["effect"] = "read"): Tool => ({
  name,
  description: "",
  parameters: {},
  effect,
  execute: async () => ({ ok: true, data: null, error: null }),
});

const baseCtx: ActionContext = { enrichmentCount: 0 };

const signal = (over: Partial<Signal>): Signal => ({
  id: Math.random().toString(36).slice(2),
  source: "news",
  title: "t",
  body: "b",
  ts: "2026-06-14T12:00:00Z",
  ...over,
});

describe("action layer — tool allow-list", () => {
  it("blocks a tool not on TOOL_ALLOW_LIST and raises a critical GUARDRAIL_VIOLATION", () => {
    const d = actionGuardrails(tool("rm_rf_everything"), baseCtx);
    expect(d.allow).toBe(false);
    expect(d.rule).toBe("TOOL_ALLOW_LIST");
    expect(d.layer).toBe("action");
    expect(d.alarm?.type).toBe("GUARDRAIL_VIOLATION");
    expect(d.alarm?.severity).toBe("critical");
  });

  it("allows an allow-listed read tool", () => {
    const d = actionGuardrails(tool("search_news", "read"), baseCtx);
    expect(d.allow).toBe(true);
    expect(d.rule).toBe("ALLOWED");
  });
});

describe("action layer — NO_SEND_WITHOUT_APPROVAL", () => {
  it("blocks a send-effect tool with no approval token", () => {
    const d = actionGuardrails(tool("send_email", "send"), baseCtx);
    expect(d.allow).toBe(false);
    expect(d.rule).toBe("NO_SEND_WITHOUT_APPROVAL");
    expect(d.alarm?.type).toBe("GUARDRAIL_VIOLATION");
  });

  it("allows a send when an approval token is presented", () => {
    const d = actionGuardrails(tool("send_email", "send"), { ...baseCtx, approvalToken: "tok-123" });
    expect(d.allow).toBe(true);
  });

  it("allows a send under standing auto-send approval", () => {
    const d = actionGuardrails(tool("send_email", "send"), { ...baseCtx, autoSend: true });
    expect(d.allow).toBe(true);
  });
});

describe("action layer — MAX_ENRICHMENT_PER_RUN", () => {
  it("blocks enrich_contact once the per-run cap is reached", () => {
    const d = actionGuardrails(tool("enrich_contact", "write"), {
      ...baseCtx,
      enrichmentCount: GUARDRAILS.MAX_ENRICHMENT_PER_RUN,
    });
    expect(d.allow).toBe(false);
    expect(d.rule).toBe("MAX_ENRICHMENT_PER_RUN");
  });

  it("allows enrich_contact below the cap", () => {
    const d = actionGuardrails(tool("enrich_contact", "write"), { ...baseCtx, enrichmentCount: 0 });
    expect(d.allow).toBe(true);
  });
});

describe("input layer — relevance + dedup", () => {
  it("drops signals below RELEVANCE_THRESHOLD", () => {
    const { kept, decisions } = inputGuardrails([
      signal({ title: "keep", relevance: 0.9 }),
      signal({ title: "drop", relevance: 0.1 }),
    ]);
    expect(kept.map((s) => s.title)).toEqual(["keep"]);
    expect(decisions.some((d) => d.rule === "RELEVANCE_THRESHOLD")).toBe(true);
  });

  it("dedups the same title within the dedup window", () => {
    const { kept, decisions } = inputGuardrails([
      signal({ title: "Same Story", ts: "2026-06-14T12:00:00Z" }),
      signal({ title: "Same Story", ts: "2026-06-14T13:00:00Z" }),
    ]);
    expect(kept).toHaveLength(1);
    expect(decisions.some((d) => d.rule === "DEDUP_WINDOW")).toBe(true);
  });
});

describe("input layer — source allow-list", () => {
  it("accepts an allow-listed host and its subdomains", () => {
    expect(isAllowedSource("https://substack.com/feed")).toBe(true);
    expect(isAllowedSource("https://someone.substack.com/p/x")).toBe(true);
  });

  it("rejects a host not on the allow-list, and malformed urls", () => {
    expect(isAllowedSource("https://evil.example.com")).toBe(false);
    expect(isAllowedSource("not a url")).toBe(false);
  });
});

describe("output layer — HALLUCINATION_FENCE", () => {
  it("flags a named entity absent from every cited source this run", () => {
    const { decisions } = outputGuardrails("Zorblax Quux announced a round.", [
      { title: "unrelated tennis match", body: "scores from today" },
    ]);
    expect(decisions.some((d) => d.rule === "HALLUCINATION_FENCE")).toBe(true);
  });

  it("does not flag an entity that appears in a cited source", () => {
    const { decisions } = outputGuardrails("Andrew Beck leads the work.", [
      { title: "Andrew Beck at PathAI", body: "pathology ai" },
    ]);
    expect(decisions.some((d) => d.rule === "HALLUCINATION_FENCE")).toBe(false);
  });
});
