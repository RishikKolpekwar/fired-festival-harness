// FollowUps aggregator — solo-finder's lane. Covers the ranking layer (pure:
// staleness/column/priority/dedup) and the three source adapters (pipeline /
// todos / brief-actions) against the orchestrator-locked FollowUpItem schema.
// Adapters hit the isolated test db (test/setup.ts); ranking is clock-injected.
import { describe, it, expect } from "vitest";
import {
  stalenessDays,
  columnFor,
  priorityFor,
  suggestedActionFor,
  rankFollowUps,
  pipelineFollowUps,
  todoFollowUps,
  briefActionFollowUps,
  extractTargetDate,
  type RawFollowUp,
} from "../src/lib/followups.js";
import { addContact, setContactStatus } from "../src/lib/pipeline.js";
import { addTodo } from "../src/lib/todos.js";
import { db } from "../src/lib/db.js";

const NOW = new Date("2026-06-15T12:00:00Z"); // 07:00 CDT — local day 2026-06-15

const raw = (over: Partial<RawFollowUp>): RawFollowUp => ({
  id: "x",
  who: "Someone",
  channel: "pipeline",
  pending: "do a thing",
  ...over,
});

describe("ranking — stalenessDays", () => {
  it("counts whole days since lastTouch", () => {
    expect(stalenessDays("2026-06-05T12:00:00Z", NOW)).toBe(10);
  });
  it("is 0 when unknown or unparseable (no penalty)", () => {
    expect(stalenessDays(undefined, NOW)).toBe(0);
    expect(stalenessDays("not a date", NOW)).toBe(0);
  });
});

describe("ranking — columnFor", () => {
  const today = "2026-06-15";
  it("future commitment → scheduled", () => {
    expect(columnFor(raw({ scheduledFor: "2026-06-20" }), 1, today)).toBe("scheduled");
  });
  it("we already reached out → awaiting_them", () => {
    expect(columnFor(raw({ awaitingThem: true }), 5, today)).toBe("awaiting_them");
  });
  it("very stale → cold", () => {
    expect(columnFor(raw({ lastTouch: "2026-01-01T00:00:00Z" }), 90, today)).toBe("cold");
  });
  it("recently touched → warm", () => {
    expect(columnFor(raw({ lastTouch: "2026-06-14T12:00:00Z" }), 2, today)).toBe("warm");
  });
  it("an open loop you owe → needs_you", () => {
    expect(columnFor(raw({ lastTouch: "2026-06-01T00:00:00Z" }), 14, today)).toBe("needs_you");
  });
  it("something you owe is needs_you even when freshly touched (not warm)", () => {
    expect(columnFor(raw({ owed: true, lastTouch: "2026-06-15T00:00:00Z" }), 0, today)).toBe("needs_you");
  });
  it("a past-due dated item is needs_you, not scheduled", () => {
    expect(columnFor(raw({ scheduledFor: "2026-06-10" }), 1, today)).toBe("needs_you");
  });
});

describe("ranking — priorityFor", () => {
  it("needs_you outranks warm at equal staleness", () => {
    const ny = priorityFor(raw({}), 5, "needs_you");
    const warm = priorityFor(raw({}), 5, "warm");
    expect(ny).toBeGreaterThan(warm);
  });
  it("cold is clamped low even when very stale", () => {
    expect(priorityFor(raw({ baseUrgency: 90 }), 120, "cold")).toBeLessThanOrEqual(25);
  });
  it("stays within 0-100", () => {
    const p = priorityFor(raw({ baseUrgency: 100 }), 999, "needs_you");
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});

describe("ranking — suggestedActionFor", () => {
  it("is channel/column specific", () => {
    expect(suggestedActionFor(raw({ channel: "pipeline", who: "Andrew Beck" }), "needs_you")).toMatch(/draft an intro to Andrew Beck/);
    expect(suggestedActionFor(raw({ awaitingThem: true, who: "Andrew Beck" }), "awaiting_them")).toMatch(/nudge/);
    expect(suggestedActionFor(raw({ channel: "todo", pending: "ship pilot" }), "needs_you")).toMatch(/ship pilot/);
  });
});

describe("ranking — rankFollowUps", () => {
  it("dedups exact source repeats and identical open loops, sorts by priority desc", () => {
    const items = rankFollowUps(
      [
        raw({ id: "a", who: "KOL One", channel: "pipeline", sourceRef: "contact:1", baseUrgency: 90, lastTouch: "2026-05-01T00:00:00Z" }),
        raw({ id: "a-dup", who: "KOL One", channel: "pipeline", sourceRef: "contact:1", baseUrgency: 90, lastTouch: "2026-05-01T00:00:00Z" }), // exact source dup
        raw({ id: "b", who: "Fresh Todo", channel: "todo", sourceRef: "todo:9", lastTouch: "2026-06-15T00:00:00Z" }),
      ],
      NOW,
    );
    // the dup collapsed
    expect(items.filter((i) => i.sourceRef === "contact:1")).toHaveLength(1);
    // sorted by priority, highest first
    expect(items[0]!.priority).toBeGreaterThanOrEqual(items[items.length - 1]!.priority);
  });
  it("excludes done items", () => {
    expect(rankFollowUps([raw({ done: true })], NOW)).toHaveLength(0);
  });
  it("collapses the same person across sources (pipeline + brief) to one, keeping highest priority", () => {
    const items = rankFollowUps(
      [
        raw({ id: "p", who: "Mikey Wessman", channel: "pipeline", sourceRef: "contact:7", pending: "intro", owed: true, baseUrgency: 50 }),
        raw({ id: "b", who: "Mikey Wessman", channel: "brief", sourceRef: "brief-action:9", pending: "mentioned in brief", owed: true, baseUrgency: 90 }),
      ],
      NOW,
    );
    const mikeys = items.filter((i) => i.who === "Mikey Wessman");
    expect(mikeys).toHaveLength(1);
    expect(mikeys[0]!.channel).toBe("brief"); // higher baseUrgency won
  });
  it("does NOT collapse two different todos that happen to share text only by source", () => {
    const items = rankFollowUps(
      [
        raw({ id: "t1", who: "buy milk", channel: "todo", sourceRef: "todo:1", owed: true }),
        raw({ id: "t2", who: "buy eggs", channel: "todo", sourceRef: "todo:2", owed: true }),
      ],
      NOW,
    );
    expect(items).toHaveLength(2);
  });
});

describe("adapters — pipeline", () => {
  it("maps a to_reach_out contact to a pipeline follow-up you owe", () => {
    const c = addContact({ name: "Andrew Beck", org: "PathAI", category: "KOL" });
    const items = pipelineFollowUps().filter((i) => i.sourceRef === `contact:${c.id}`);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ who: "Andrew Beck", org: "PathAI", channel: "pipeline", entity: "person:andrew-beck" });
    expect(items[0]!.awaitingThem).toBeFalsy();
    expect(items[0]!.owed).toBe(true); // never contacted → you owe the first move
    expect(items[0]!.pending).toMatch(/reach out \(KOL\)/);
  });
  it("marks a contacted lead as awaiting_them and excludes done", () => {
    const c = addContact({ name: "Gabriele Campanella", org: "Mount Sinai", category: "KOL" });
    setContactStatus(c.id, "contacted");
    const after = pipelineFollowUps().find((i) => i.sourceRef === `contact:${c.id}`);
    expect(after?.awaitingThem).toBe(true);
    setContactStatus(c.id, "done");
    expect(pipelineFollowUps().some((i) => i.sourceRef === `contact:${c.id}`)).toBe(false);
  });
});

describe("extractTargetDate — date out of free text", () => {
  it("parses 'Month D' and 'D Month'", () => {
    expect(extractTargetDate("delete the trigger around June 20", NOW)).toBe("2026-06-20");
    expect(extractTargetDate("ship it by 20 june", NOW)).toBe("2026-06-20");
  });
  it("parses an ISO date", () => {
    expect(extractTargetDate("due 2026-07-01 — file taxes", NOW)).toBe("2026-07-01");
  });
  it("rolls a well-past month/day to next year", () => {
    expect(extractTargetDate("january 5 renewal", NOW)).toBe("2027-01-05");
  });
  it("resolves a weekday to its upcoming date (the 'friday 4pm with neil' case)", () => {
    const d = extractTargetDate("friday 4pm is confirmed with neil", NOW)!;
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(5); // a Friday
    expect(d >= "2026-06-15").toBe(true); // not in the past
  });
  it("handles tomorrow / today", () => {
    expect(extractTargetDate("call them tomorrow", NOW)).toBe("2026-06-16");
    expect(extractTargetDate("confirm tennis tonight", NOW)).toBe("2026-06-15");
  });
  it("returns undefined when there's no date", () => {
    expect(extractTargetDate("build a crypto wallet", NOW)).toBeUndefined();
  });
});

describe("adapters — todos", () => {
  it("maps a dated todo to a scheduled commitment", () => {
    const t = addTodo({ title: "ship er pr pilot", dueDate: "2026-06-20", tag: "medmorphiq" });
    const item = todoFollowUps().find((i) => i.sourceRef === `todo:${t.id}`);
    expect(item).toMatchObject({ channel: "todo", scheduledFor: "2026-06-20", entity: "project:medmorphiq" });
    // and the ranking layer files it under scheduled
    const ranked = rankFollowUps([item!], NOW);
    expect(ranked[0]!.column).toBe("scheduled");
  });

  it("date-anchors a todo whose date is only in the TITLE → scheduled (the purgeTransferred case)", () => {
    const t = addTodo({ title: "Delete the every-minute purgeTransferred Apps Script trigger around June 20" });
    const item = todoFollowUps().find((i) => i.sourceRef === `todo:${t.id}`);
    expect(item!.scheduledFor).toMatch(/-06-20$/); // pulled from the title, no structured dueDate
    const ranked = rankFollowUps([item!], NOW);
    expect(ranked[0]!.column).toBe("scheduled"); // NOT needs_you / cold
    expect(ranked[0]!.suggestedAction).toMatch(/^do it by /); // a todo CTA, not "prep for"
  });
});

describe("adapters — brief actions", () => {
  it("maps the latest brief's action items to follow-ups", () => {
    db.prepare(`INSERT INTO briefs (id, generated_at, payload) VALUES (?, ?, ?)`).run(
      "b-test",
      "2026-06-15T11:00:00Z",
      JSON.stringify({
        id: "b-test",
        generatedAt: "2026-06-15T11:00:00Z",
        items: [],
        actions: [{ id: "a1", kind: "email", who: "Rajendra Singh", org: "Penn Medicine", reason: "intro re: pathology pilot", sourceSignalIds: [] }],
        citedSources: [],
      }),
    );
    const item = briefActionFollowUps().find((i) => i.sourceRef === "brief-action:a1");
    expect(item).toMatchObject({ who: "Rajendra Singh", org: "Penn Medicine", channel: "brief", entity: "person:rajendra-singh" });
    expect(item!.pending).toMatch(/pathology pilot/);
    // crisp CTA from the action kind — NOT the rationale echoed back
    expect(item!.suggestedAction).toBe("draft an email to Rajendra Singh");
    const ranked = rankFollowUps([item!], NOW);
    expect(ranked[0]!.suggestedAction).toBe("draft an email to Rajendra Singh");
  });

  it("never yields a blank headline when the action's who is an empty string", () => {
    db.prepare(`INSERT INTO briefs (id, generated_at, payload) VALUES (?, ?, ?)`).run(
      "b-blank",
      "2026-06-15T11:30:00Z",
      JSON.stringify({
        id: "b-blank",
        generatedAt: "2026-06-15T11:30:00Z",
        items: [],
        actions: [{ id: "a2", kind: "job", who: "", org: "Tempus", reason: "apply to the ML role", sourceSignalIds: [] }],
        citedSources: [],
      }),
    );
    const item = briefActionFollowUps().find((i) => i.sourceRef === "brief-action:a2");
    // `||` falls through the empty who to org; never blank.
    expect(item!.who).toBe("Tempus");
    expect(item!.who).not.toBe("");
  });
});
