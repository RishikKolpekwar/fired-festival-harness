import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db.js";
import { generateBrief, latestBrief } from "../src/lib/harness/brief.js";
import type { Agent, Brief } from "../src/lib/harness/types.js";

// A worker that always returns an empty JSON object → every scout yields 0 items,
// so generateBrief hits the EMPTY-BRIEF GUARD. This proves a barren run can never
// overwrite a good brief or be treated as "today's".
const emptyWorker: Agent = {
  id: "test-empty-worker",
  async run() {
    return { text: "{}", usedTools: [], citedSources: [], usage: { inputTokens: 0, outputTokens: 0 } };
  },
};

function seedGoodBrief(): Brief {
  const good: Brief = {
    id: "good-brief-1",
    generatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    topline: "the last good read",
    items: [{ title: "a real item", summary: "s", whyItMatters: "w", score: 0.9 }],
    actions: [],
    todos: [],
    citedSources: [],
  };
  db.prepare(`INSERT INTO briefs (id, generated_at, payload) VALUES (?, ?, ?)`).run(good.id, good.generatedAt, JSON.stringify(good));
  return good;
}

describe("empty-brief guard (brief.ts)", () => {
  beforeEach(() => {
    db.prepare(`DELETE FROM briefs`).run();
    db.prepare(`DELETE FROM runs`).run();
    db.prepare(`DELETE FROM alarms`).run();
  });

  it("never persists a 0-item brief — the previous good brief stays latest", async () => {
    const good = seedGoodBrief();
    const result = await generateBrief({ emit: () => {}, worker: emptyWorker });

    expect(result.items.length).toBe(0); // the empty generation
    // latestBrief() must still be the seeded good one — NOT overwritten by the blank run
    expect(latestBrief()?.id).toBe(good.id);
    const count = (db.prepare(`SELECT COUNT(*) AS c FROM briefs`).get() as { c: number }).c;
    expect(count).toBe(1); // only the seeded brief was ever written
  });

  it("marks the run 'empty' and raises the EMPTY_BRIEF alarm so the miss is visible", async () => {
    seedGoodBrief();
    await generateBrief({ emit: () => {}, worker: emptyWorker });

    const emptyRuns = (db.prepare(`SELECT COUNT(*) AS c FROM runs WHERE status = 'empty'`).get() as { c: number }).c;
    expect(emptyRuns).toBeGreaterThanOrEqual(1);
    const alarms = (db.prepare(`SELECT COUNT(*) AS c FROM alarms WHERE type = 'EMPTY_BRIEF'`).get() as { c: number }).c;
    expect(alarms).toBeGreaterThanOrEqual(1);
  });

  it("emits a status (not a canvas) on an empty run, so the UI keeps the prior brief", async () => {
    seedGoodBrief();
    const events: { kind: string }[] = [];
    await generateBrief({ emit: (e) => events.push(e as { kind: string }), worker: emptyWorker });
    expect(events.some((e) => e.kind === "canvas")).toBe(false); // no empty brief pushed to the canvas
    expect(events.some((e) => e.kind === "done")).toBe(true);
  });
});
