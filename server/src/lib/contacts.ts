// Resolve iMessage handles (phone/email) → contact names via the local macOS
// AddressBook SQLite db(s). Read-only, cached. Falls back to the raw handle if
// Contacts isn't readable (same Full Disk Access requirement as Messages).
import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AB_ROOT = join(homedir(), "Library/Application Support/AddressBook");

let cache: { byPhone: Map<string, string>; byEmail: Map<string, string>; at: number } | null = null;
const TTL_MS = 5 * 60_000;

// Last 10 digits — robust to +1, formatting, spaces.
function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.slice(-10);
}

function discoverDbs(): string[] {
  const dbs: string[] = [];
  const top = join(AB_ROOT, "AddressBook-v22.abcddb");
  if (existsSync(top)) dbs.push(top);
  const sources = join(AB_ROOT, "Sources");
  if (existsSync(sources)) {
    for (const dir of readdirSync(sources)) {
      const p = join(sources, dir, "AddressBook-v22.abcddb");
      if (existsSync(p)) dbs.push(p);
    }
  }
  return dbs;
}

function nameOf(first: string | null, last: string | null, org: string | null): string | null {
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || (org?.trim() || null);
}

function buildMaps(): { byPhone: Map<string, string>; byEmail: Map<string, string> } {
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const path of discoverDbs()) {
    let db: Database.Database | null = null;
    try {
      db = new Database(path, { readonly: true, fileMustExist: true });
      const phones = db
        .prepare(
          `SELECT r.ZFIRSTNAME AS f, r.ZLASTNAME AS l, r.ZORGANIZATION AS o, p.ZFULLNUMBER AS num
           FROM ZABCDRECORD r JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK
           WHERE p.ZFULLNUMBER IS NOT NULL`,
        )
        .all() as { f: string | null; l: string | null; o: string | null; num: string }[];
      for (const row of phones) {
        const name = nameOf(row.f, row.l, row.o);
        const key = phoneKey(row.num);
        if (name && key.length === 10 && !byPhone.has(key)) byPhone.set(key, name);
      }
      const emails = db
        .prepare(
          `SELECT r.ZFIRSTNAME AS f, r.ZLASTNAME AS l, r.ZORGANIZATION AS o, e.ZADDRESS AS addr
           FROM ZABCDRECORD r JOIN ZABCDEMAILADDRESS e ON e.ZOWNER = r.Z_PK
           WHERE e.ZADDRESS IS NOT NULL`,
        )
        .all() as { f: string | null; l: string | null; o: string | null; addr: string }[];
      for (const row of emails) {
        const name = nameOf(row.f, row.l, row.o);
        const key = row.addr.toLowerCase().trim();
        if (name && !byEmail.has(key)) byEmail.set(key, name);
      }
    } catch {
      /* skip unreadable source */
    } finally {
      db?.close();
    }
  }
  return { byPhone, byEmail };
}

function maps() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const { byPhone, byEmail } = buildMaps();
  cache = { byPhone, byEmail, at: Date.now() };
  return cache;
}

/** Returns a contact name for a handle, or null if unknown. */
export function resolveHandle(handle: string): string | null {
  const m = maps();
  if (handle.includes("@")) return m.byEmail.get(handle.toLowerCase().trim()) ?? null;
  const key = phoneKey(handle);
  return key.length === 10 ? (m.byPhone.get(key) ?? null) : null;
}

export interface ContactCard {
  name: string;
  org?: string;
  jobTitle?: string;
  emails: string[];
  phones: string[];
}

/**
 * Look up full contact card(s) by a name query (first / last / nickname / org).
 * Reads org + job title straight from the macOS Contacts card. This is how
 * "where does X work" gets answered when the card has a company filled in.
 */
export function lookupContacts(query: string): ContactCard[] {
  const needle = query.toLowerCase().trim();
  if (!needle) return [];
  const out = new Map<string, ContactCard>(); // keyed by name to dedupe across sources
  for (const path of discoverDbs()) {
    let db: Database.Database | null = null;
    try {
      db = new Database(path, { readonly: true, fileMustExist: true });
      const recs = db
        .prepare(
          `SELECT Z_PK pk, ZFIRSTNAME f, ZLASTNAME l, ZNICKNAME n, ZORGANIZATION o, ZJOBTITLE j
           FROM ZABCDRECORD
           WHERE lower(ZFIRSTNAME) LIKE ? OR lower(ZLASTNAME) LIKE ? OR lower(ZNICKNAME) LIKE ?
              OR lower(ZORGANIZATION) LIKE ? OR lower(ZFIRSTNAME || ' ' || ZLASTNAME) LIKE ?`,
        )
        .all(`%${needle}%`, `%${needle}%`, `%${needle}%`, `%${needle}%`, `%${needle}%`) as {
        pk: number; f: string | null; l: string | null; n: string | null; o: string | null; j: string | null;
      }[];
      for (const r of recs) {
        const name = [r.f, r.l].filter(Boolean).join(" ").trim() || r.n || r.o;
        if (!name) continue;
        const emails = (db.prepare(`SELECT ZADDRESS a FROM ZABCDEMAILADDRESS WHERE ZOWNER = ?`).all(r.pk) as { a: string }[]).map((e) => e.a).filter(Boolean);
        const phones = (db.prepare(`SELECT ZFULLNUMBER p FROM ZABCDPHONENUMBER WHERE ZOWNER = ?`).all(r.pk) as { p: string }[]).map((p) => p.p).filter(Boolean);
        const card: ContactCard = {
          name,
          org: r.o?.trim() || undefined,
          jobTitle: r.j?.trim() || undefined,
          emails,
          phones,
        };
        // prefer the richest record for a given name
        const prev = out.get(name);
        if (!prev || (!prev.org && card.org) || (prev.emails.length < card.emails.length)) out.set(name, card);
      }
    } catch {
      /* skip unreadable source */
    } finally {
      db?.close();
    }
  }
  return [...out.values()];
}
