// General memory store — arbitrary facts the user tells Solo to remember
// ("my dad works at Dell", "I'm allergic to penicillin"). Distinct from todos
// (tasks), contacts (people to reach), and interests (mined topics). Recalled on
// demand by the agent and folded into personalization.
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { noHyphens } from "./format.js";

const now = () => new Date().toISOString();

export interface Fact {
  id: string;
  subject?: string;
  fact: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Store a fact. If one with the same subject already exists, update it. */
export function remember(fact: string, subject?: string): Fact {
  const clean = noHyphens(fact.trim());
  const subj = subject?.toLowerCase().trim() || inferSubject(clean);
  if (subj) {
    const existing = db.prepare(`SELECT id FROM facts WHERE subject = ?`).get(subj) as { id: string } | undefined;
    if (existing) {
      db.prepare(`UPDATE facts SET fact = ?, updated_at = ? WHERE id = ?`).run(clean, now(), existing.id);
      return { id: existing.id, subject: subj, fact: clean };
    }
  }
  const id = nanoid(10);
  db.prepare(`INSERT INTO facts (id, subject, fact, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(id, subj ?? null, clean, now(), now());
  return { id, subject: subj, fact: clean };
}

/** Recall facts matching a query (subject or text). Empty query → all facts. */
export function recall(query?: string): Fact[] {
  const rows = (query?.trim()
    ? db.prepare(`SELECT * FROM facts WHERE lower(subject) LIKE ? OR lower(fact) LIKE ? ORDER BY updated_at DESC`).all(`%${query.toLowerCase().trim()}%`, `%${query.toLowerCase().trim()}%`)
    : db.prepare(`SELECT * FROM facts ORDER BY updated_at DESC`).all()) as Record<string, string | null>[];
  return rows.map((r) => ({ id: String(r.id), subject: r.subject ?? undefined, fact: String(r.fact), createdAt: r.created_at ?? undefined, updatedAt: r.updated_at ?? undefined }));
}

export function forget(id: string): boolean {
  return db.prepare(`DELETE FROM facts WHERE id = ?`).run(id).changes > 0;
}

/** Cheap subject guess from a statement: "my dad works at X" → "dad". */
function inferSubject(fact: string): string | undefined {
  const m = fact.toLowerCase().match(/\bmy\s+([a-z]+)\b/);
  if (m) return m[1];
  if (/\bi\s+(am|'m|like|love|hate|prefer|work|live|have)\b/.test(fact.toLowerCase())) return "me";
  return undefined;
}
