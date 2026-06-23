// Personal todos / project reminders — the general to-do store (distinct from the
// outreach pipeline, which is people-shaped). Open todos resurface in the morning
// brief until marked done. "add to my todo: build a crypto wallet" lands here.
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { noHyphens } from "./format.js";

const now = () => new Date().toISOString();

export interface Todo {
  id: string;
  title: string;
  detail?: string;
  tag?: string;
  status: "open" | "done";
  inBrief: boolean;
  dueDate?: string; // YYYY-MM-DD; if set, only surfaces in the brief on/around this day
  createdAt?: string;
  doneAt?: string;
}

export function addTodo(t: { title: string; detail?: string; tag?: string; inBrief?: boolean; dueDate?: string }): Todo {
  const id = nanoid(10);
  const title = noHyphens(t.title.trim());
  const detail = t.detail ? noHyphens(t.detail) : undefined;
  const inBrief = t.inBrief !== false;
  // Explicit dueDate wins; otherwise auto-extract a date from the text so a todo
  // like "... around June 20" carries a dueDate and the brief can gate it (instead
  // of nagging every day as an undated item).
  const dueDate = normalizeDate(t.dueDate) ?? extractTargetDate(`${t.title} ${t.detail ?? ""}`);
  db.prepare(
    `INSERT INTO todos (id, title, detail, tag, status, in_brief, due_date, created_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).run(id, title, detail ?? null, t.tag ?? null, inBrief ? 1 : 0, dueDate ?? null, now());
  return { id, title, detail, tag: t.tag, status: "open", inBrief, dueDate, createdAt: now() };
}

/** How long an UNDATED todo keeps surfacing in the brief before it's considered a
 *  stale chore and ages out (it stays in the todo list, just stops nagging daily). */
const UNDATED_BRIEF_WINDOW_DAYS = 14;

/** Open todos that should appear in TODAY's brief:
 *  - dated (incl. a date parsed from the text) → only from the day before the due
 *    date through the due date itself (then it's overdue and stays until done);
 *  - undated → only while FRESH (created within the window), so a leftover dateless
 *    chore stops repeating every single day forever.
 *  Fixes both a dated reminder (e.g. June 20) AND an undated chore nagging daily. */
export function todosForBrief(todayLocal: string, now: Date = new Date()): Todo[] {
  return listTodos("open").filter((t) => {
    if (!t.inBrief) return false;
    const due = t.dueDate ?? extractTargetDate(`${t.title} ${t.detail ?? ""}`, now);
    if (due) {
      return due <= todayLocal // overdue or due today
        ? true
        : daysBetween(todayLocal, due) <= 1; // 1-day heads-up
    }
    if (!t.createdAt) return true; // unknown age → surface (rare)
    return daysBetween(localDateISO(new Date(t.createdAt)), todayLocal) <= UNDATED_BRIEF_WINDOW_DAYS;
  });
}

/** Local calendar day as YYYY-MM-DD (machine timezone, not UTC). */
export function localDateISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeDate(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : localDateISO(d);
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Pull a target date (YYYY-MM-DD, local) out of free text when it isn't in a
 * structured field — "delete the trigger around June 20", "friday 4pm", an ISO
 * date, tomorrow/today. A month/day already well past this year rolls to next.
 * Shared by the brief's todo gating and the follow-ups ranking (followups.ts
 * re-exports it), so it lives here to avoid a circular import.
 */
export function extractTargetDate(text: string, now: Date = new Date()): string | undefined {
  const t = (text ?? "").toLowerCase();
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const addDays = (d: Date, n: number) => {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return localDateISO(c);
  };
  if (/\btomorrow\b/.test(t)) return addDays(now, 1);
  if (/\b(today|tonight)\b/.test(t)) return addDays(now, 0);
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) return addDays(now, (i - now.getDay() + 7) % 7);
  }

  const names = Object.keys(MONTHS).join("|");
  let month: number | undefined;
  let day: number | undefined;
  const md = t.match(new RegExp(`\\b(${names})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${names})\\b`));
  if (md) {
    month = MONTHS[md[1]!];
    day = parseInt(md[2]!, 10);
  } else if (dm) {
    month = MONTHS[dm[2]!];
    day = parseInt(dm[1]!, 10);
  }
  if (!month || !day || day < 1 || day > 31) return undefined;

  let year = now.getFullYear();
  const iso2 = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (Date.parse(iso2(year) + "T00:00:00Z") < now.getTime() - 7 * 86_400_000) year += 1;
  return iso2(year);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function listTodos(status?: "open" | "done"): Todo[] {
  const rows = (status
    ? db.prepare(`SELECT * FROM todos WHERE status = ? ORDER BY created_at DESC`).all(status)
    : db.prepare(`SELECT * FROM todos ORDER BY status, created_at DESC`).all()) as Record<string, string | number | null>[];
  return rows.map(rowToTodo);
}

export function completeTodo(id: string): boolean {
  const info = db.prepare(`UPDATE todos SET status = 'done', done_at = ? WHERE id = ?`).run(now(), id);
  return info.changes > 0;
}

export function reopenTodo(id: string): boolean {
  const info = db.prepare(`UPDATE todos SET status = 'open', done_at = NULL WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function removeTodo(id: string): boolean {
  return db.prepare(`DELETE FROM todos WHERE id = ?`).run(id).changes > 0;
}

function rowToTodo(r: Record<string, string | number | null>): Todo {
  return {
    id: String(r.id),
    title: String(r.title),
    detail: r.detail != null ? String(r.detail) : undefined,
    tag: r.tag != null ? String(r.tag) : undefined,
    status: (r.status as Todo["status"]) ?? "open",
    inBrief: Number(r.in_brief) === 1,
    dueDate: r.due_date != null ? String(r.due_date) : undefined,
    createdAt: r.created_at != null ? String(r.created_at) : undefined,
    doneAt: r.done_at != null ? String(r.done_at) : undefined,
  };
}
