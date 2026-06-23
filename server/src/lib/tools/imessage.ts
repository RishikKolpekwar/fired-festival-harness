// Material handling — local iMessage (macOS chat.db), READ-ONLY.
// Two modes:
//   (1) recent inbound sweep (for the brief);
//   (2) targeted lookup of a person — every conversation they're in, 1:1 AND
//       group chats, both directions (incl. your own sent messages, which in
//       groups have no handle and are only linked via the chat tables).
// Never writes. Requires Full Disk Access.
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { existsSync } from "node:fs";
import { config } from "../config.js";
import { resolveHandle } from "../contacts.js";
import type { Signal, Tool } from "../harness/types.js";

const COCOA_EPOCH_MS = Date.UTC(2001, 0, 1);
function appleDateToIso(appleNs: number): string {
  return new Date(COCOA_EPOCH_MS + appleNs / 1_000_000).toISOString();
}

const STYLE_GROUP = 43; // chat.style: 43 = group, 45 = 1:1

export const readImessage: Tool<{
  contact?: string;
  search?: string;
  direction?: "in" | "out" | "both";
  sinceHours?: number;
  max?: number;
}> = {
  name: "read_imessage",
  description:
    "Read iMessages (read-only, local). Provide `contact` (name/phone/email) to scope to everywhere you talk to that person — 1:1 AND group chats, sent and received. " +
    "For questions about what someone said or what you know about them ('is Roshan strong?', 'what did Arjan say about the trip?'), ALSO pass `search` with several space-separated keywords (synonyms help — e.g. 'bench lift gym strong lbs workout'); it scans the person's ENTIRE history, not just recent messages, and returns every match. " +
    "Without `search` you get only the most recent messages. Without `contact` you get the recent inbound sweep. Never sends.",
  parameters: {
    contact: { type: "string", description: "Name / phone / email to scope to (covers 1:1 and group chats)" },
    search: { type: "string", description: "Space-separated keywords (OR-matched) to find across the person's FULL history. Use synonyms for topical/attribute questions." },
    direction: { type: "string", description: "'in', 'out', or 'both' (default when contact given)" },
    sinceHours: { type: "number", description: "Look-back window when no contact (default 24)" },
    max: { type: "number", description: "Max messages (default 40 sweep, 15 recent lookup, 30 search)" },
  },
  effect: "read",
  async execute({ contact, search, direction, sinceHours = 24, max }) {
    if (!existsSync(config.imessageDbPath)) {
      return { ok: false, data: null, error: `chat.db not found at ${config.imessageDbPath}`, signals: [] };
    }
    const dir = direction ?? (contact ? "both" : "in");
    const limit = max ?? (search ? 30 : contact ? 15 : 40);

    let dbm: Database.Database | null = null;
    try {
      dbm = new Database(config.imessageDbPath, { readonly: true, fileMustExist: true });

      const signals: Signal[] = contact
        ? lookupContact(dbm, contact, dir, limit, search)
        : recentSweep(dbm, sinceHours, dir, limit);

      if (contact && signals.length === 0) {
        return { ok: true, data: { count: 0, note: `no messages found with "${contact}"` }, error: null, signals: [] };
      }
      return { ok: true, data: { count: signals.length }, error: null, signals };
    } catch (err) {
      const msg = String(err);
      const hint = /authorization|operation not permitted|unable to open/i.test(msg)
        ? " — grant Full Disk Access to the terminal/process in System Settings → Privacy & Security."
        : "";
      return { ok: false, data: null, error: msg + hint, signals: [] };
    } finally {
      dbm?.close();
    }
  },
};

// ── Mode 1: recent inbound sweep (brief) ──────────────────────────────────────
function recentSweep(dbm: Database.Database, sinceHours: number, dir: string, limit: number): Signal[] {
  const cutoffNs = (Date.now() - sinceHours * 3_600_000 - COCOA_EPOCH_MS) * 1_000_000;
  const rows = dbm
    .prepare(
      `SELECT m.text AS text, m.date AS date, m.is_from_me AS fromMe, COALESCE(h.id,'unknown') AS handle
       FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID
       WHERE m.text IS NOT NULL AND m.text != '' AND m.date > ?
       ORDER BY m.date DESC LIMIT 400`,
    )
    .all(cutoffNs) as { text: string; date: number; fromMe: number; handle: string }[];
  return rows
    .filter((r) => (dir === "both" ? true : dir === "out" ? r.fromMe === 1 : r.fromMe === 0))
    .slice(0, limit)
    .map((r) => {
      const name = resolveHandle(r.handle) ?? r.handle;
      return {
        id: nanoid(10),
        source: "imessage" as const,
        title: r.fromMe === 1 ? `You → ${name}` : `${name} → You`,
        body: r.text.slice(0, 500),
        ts: appleDateToIso(r.date),
        meta: { handle: r.handle, contact: resolveHandle(r.handle) ?? undefined, direction: r.fromMe === 1 ? "out" : "in" },
      };
    });
}

// ── Mode 2: targeted lookup via chat tables (covers groups) ───────────────────
function lookupContact(dbm: Database.Database, contact: string, dir: string, limit: number, search?: string): Signal[] {
  const needle = contact.toLowerCase().trim();

  // Resolve every handle to a display name; find the ROWIDs matching the query.
  const handles = dbm.prepare(`SELECT ROWID AS rowid, id FROM handle`).all() as { rowid: number; id: string }[];
  const handleDisplay = new Map<number, string>();
  const matchRowids: number[] = [];
  for (const h of handles) {
    const name = resolveHandle(h.id);
    handleDisplay.set(h.rowid, name ?? h.id);
    if (name?.toLowerCase().includes(needle) || h.id.toLowerCase().includes(needle)) matchRowids.push(h.rowid);
  }
  if (matchRowids.length === 0) return [];

  // Every chat (1:1 or group) that person is a member of.
  const chatIds = (
    dbm
      .prepare(`SELECT DISTINCT chat_id AS id FROM chat_handle_join WHERE handle_id IN (${ph(matchRowids.length)})`)
      .all(...matchRowids) as { id: number }[]
  ).map((c) => c.id);
  if (chatIds.length === 0) return [];

  // Chat metadata + member labels (for group display names).
  const chatMeta = new Map<number, { style: number; name: string }>();
  for (const c of dbm
    .prepare(`SELECT ROWID AS id, display_name AS dn, style, chat_identifier AS ci FROM chat WHERE ROWID IN (${ph(chatIds.length)})`)
    .all(...chatIds) as { id: number; dn: string | null; style: number; ci: string }[]) {
    chatMeta.set(c.id, { style: c.style, name: (c.dn && c.dn.trim()) || "" });
  }
  // Fill unnamed group labels from member names.
  for (const id of chatIds) {
    const meta = chatMeta.get(id);
    if (meta && meta.style === STYLE_GROUP && !meta.name) {
      const members = (dbm.prepare(`SELECT handle_id AS h FROM chat_handle_join WHERE chat_id = ?`).all(id) as { h: number }[])
        .map((m) => handleDisplay.get(m.h) ?? "?")
        .slice(0, 3);
      meta.name = `group (${members.join(", ")})`;
    }
  }

  // Messages across those chats, both directions (your sent msgs included).
  // With `search`, OR-match keywords over the person's ENTIRE history (not just
  // recent) so older facts are findable. Without it, just the most recent.
  const terms = (search ?? "").toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const searchClause = terms.length ? ` AND (${terms.map(() => "LOWER(m.text) LIKE ?").join(" OR ")})` : "";
  const searchParams = terms.map((t) => `%${t}%`);
  const scanLimit = terms.length ? 500 : 5000;
  const msgs = dbm
    .prepare(
      `SELECT m.text AS text, m.date AS date, m.is_from_me AS fromMe, m.handle_id AS hid, cmj.chat_id AS cid
       FROM chat_message_join cmj
       JOIN message m ON m.ROWID = cmj.message_id
       WHERE cmj.chat_id IN (${ph(chatIds.length)}) AND m.text IS NOT NULL AND m.text != ''${searchClause}
       ORDER BY m.date DESC LIMIT ${scanLimit}`,
    )
    .all(...chatIds, ...searchParams) as { text: string; date: number; fromMe: number; hid: number; cid: number }[];

  return msgs
    .filter((r) => (dir === "both" ? true : dir === "out" ? r.fromMe === 1 : r.fromMe === 0))
    .slice(0, limit)
    .map((r) => {
      const meta = chatMeta.get(r.cid);
      const isGroup = meta?.style === STYLE_GROUP;
      const sender = r.fromMe === 1 ? "You" : handleDisplay.get(r.hid) ?? "unknown";
      const title = isGroup
        ? `[${meta?.name}] ${sender}`
        : r.fromMe === 1
          ? `You → ${handleDisplay.get(r.hid) ?? contact}`
          : `${sender} → You`;
      return {
        id: nanoid(10),
        source: "imessage" as const,
        title,
        body: r.text.slice(0, 500),
        ts: appleDateToIso(r.date),
        meta: { isGroup, group: isGroup ? meta?.name : undefined, sender, direction: r.fromMe === 1 ? "out" : "in" },
      };
    });
}

const ph = (n: number) => Array.from({ length: n }, () => "?").join(",");
