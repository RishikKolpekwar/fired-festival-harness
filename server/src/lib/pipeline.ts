// Outreach pipeline — people the user wants to reach out to (KOLs, cofounders,
// interesting connections). Persists across runs; pending contacts surface in
// the morning brief as reminders until acted on.
import { nanoid } from "nanoid";
import { db } from "./db.js";

const now = () => new Date().toISOString();

export interface Contact {
  id: string;
  name: string;
  org?: string;
  category?: string; // KOL | cofounder | institution | connection
  status: string; // to_reach_out | contacted | replied | done
  link?: string;
  note?: string;
  nextAction?: string;
  lastTouch?: string;
  createdAt?: string;
}

export function addContact(c: {
  name: string;
  org?: string;
  category?: string;
  link?: string;
  note?: string;
  nextAction?: string;
}): Contact {
  const id = nanoid(10);
  db.prepare(
    `INSERT INTO contacts (id, name, org, category, status, link, note, next_action, created_at)
     VALUES (?, ?, ?, ?, 'to_reach_out', ?, ?, ?, ?)`,
  ).run(id, c.name, c.org ?? null, c.category ?? "connection", c.link ?? null, c.note ?? null, c.nextAction ?? null, now());
  return { id, status: "to_reach_out", ...c };
}

export function listContacts(status?: string): Contact[] {
  const rows = (status
    ? db.prepare(`SELECT * FROM contacts WHERE status = ? ORDER BY created_at DESC`).all(status)
    : db.prepare(`SELECT * FROM contacts ORDER BY created_at DESC`).all()) as Record<string, string | null>[];
  return rows.map((r) => ({
    id: r.id!,
    name: r.name!,
    org: r.org ?? undefined,
    category: r.category ?? undefined,
    status: r.status ?? "to_reach_out",
    link: r.link ?? undefined,
    note: r.note ?? undefined,
    nextAction: r.next_action ?? undefined,
    lastTouch: r.last_touch ?? undefined,
    createdAt: r.created_at ?? undefined,
  }));
}

export function setContactStatus(id: string, status: string): boolean {
  const info = db.prepare(`UPDATE contacts SET status = ?, last_touch = ? WHERE id = ?`).run(status, now(), id);
  return info.changes > 0;
}
