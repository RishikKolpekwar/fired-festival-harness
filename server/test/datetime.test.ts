// Regression tests for the two brief-gen date bugs Rishik hit (2026-06-14):
//   1. DATE OFF-BY-ONE — the dateline rolled forward a day in the evening because
//      it derived "today" from a UTC instant. localDateISO() must return the
//      LOCAL calendar day. (tz pinned to America/Chicago in vitest.config.ts)
//   2. DATED TODO EVERY DAY — a todo due June 20 was injected into every brief.
//      todosForBrief(today) must gate dated todos to on/around their due date.
// Imports solo-builder's exported helpers read-only; todos hit the isolated db.
import { describe, it, expect } from "vitest";
import { localDateISO, addTodo, todosForBrief, extractTargetDate } from "../src/lib/todos.js";
import { db } from "../src/lib/db.js";

describe("localDateISO — local calendar day, not UTC (bug 1)", () => {
  it("returns the LOCAL date for an evening-Central instant that is already the next day in UTC", () => {
    // 2026-06-15T02:30:00Z === 2026-06-14 21:30 CDT. The bug rolled this to the 15th.
    expect(localDateISO(new Date("2026-06-15T02:30:00Z"))).toBe("2026-06-14");
  });

  it("crosses to the next local day only when local midnight actually passes", () => {
    // 23:00 CDT on the 14th → still the 14th.
    expect(localDateISO(new Date("2026-06-15T04:00:00Z"))).toBe("2026-06-14");
    // 00:30 CDT on the 15th → now the 15th.
    expect(localDateISO(new Date("2026-06-15T05:30:00Z"))).toBe("2026-06-15");
  });

  it("formats as zero-padded YYYY-MM-DD", () => {
    expect(localDateISO(new Date("2026-01-05T18:00:00Z"))).toBe("2026-01-05");
  });
});

describe("todosForBrief — dated todos gate to their due window (bug 2)", () => {
  const TODAY = "2026-06-14";

  it("surfaces undated, due-today, day-before, and overdue todos; hides far-future ones", () => {
    // NB: titles are stored via noHyphens() (Rishik's no-hyphen style), so keep
    // these hyphen-free or the round-trip won't match.
    addTodo({ title: "standing undated todo" });
    addTodo({ title: "due today", dueDate: "2026-06-14" });
    addTodo({ title: "due tomorrow heads up", dueDate: "2026-06-15" });
    addTodo({ title: "due in two days", dueDate: "2026-06-16" });
    addTodo({ title: "the june 20 reminder the bug", dueDate: "2026-06-20" });
    addTodo({ title: "overdue", dueDate: "2026-06-10" });

    const titles = todosForBrief(TODAY).map((t) => t.title);

    expect(titles).toContain("standing undated todo");
    expect(titles).toContain("due today");
    expect(titles).toContain("due tomorrow heads up");
    expect(titles).toContain("overdue");

    // The actual bug: a +6-day reminder must NOT appear every day.
    expect(titles).not.toContain("the june 20 reminder the bug");
    expect(titles).not.toContain("due in two days");
  });
});

describe("brief todo nag fix (2026-06-18) — undated dating + staleness cap", () => {
  const rawTodo = (id: string, title: string, createdAt: string) =>
    db
      .prepare(`INSERT INTO todos (id,title,detail,tag,status,in_brief,due_date,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, title, null, null, "open", 1, null, createdAt); // due_date NULL = legacy/undated row

  it("addTodo auto-extracts a dueDate from the title so it's not stored undated", () => {
    const t = addTodo({ title: "delete the purgeTransferred trigger around June 20" });
    expect(t.dueDate).toMatch(/-06-20$/);
  });

  it("gates a legacy undated todo whose date is only in the title — no daily nag", () => {
    rawTodo("legacy-purge", "delete the purgeTransferred trigger around June 20", "2026-06-01T00:00:00Z");
    // June-20 item, two days out on the 18th → hidden (stops the every-day nag)
    const jun18 = todosForBrief("2026-06-18", new Date("2026-06-18T12:00:00Z")).find((t) => t.id === "legacy-purge");
    expect(jun18).toBeUndefined();
    // 1-day heads-up on the 19th → surfaces
    const jun19 = todosForBrief("2026-06-19", new Date("2026-06-19T12:00:00Z")).find((t) => t.id === "legacy-purge");
    expect(jun19).toBeDefined();
  });

  it("ages a stale dateless chore out of the brief but keeps a fresh one", () => {
    rawTodo("stale-chore", "reorganize the garage someday", "2026-05-01T00:00:00Z"); // ~48d old
    rawTodo("fresh-chore", "buy a new charger", "2026-06-17T00:00:00Z"); // yesterday
    const ids = todosForBrief("2026-06-18", new Date("2026-06-18T12:00:00Z")).map((t) => t.id);
    expect(ids).not.toContain("stale-chore");
    expect(ids).toContain("fresh-chore");
  });
});
