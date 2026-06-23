// iMessage bridge — talk to Solo from your phone. You text yourself (your phone
// number or your Apple ID email) "solo <query>"; it syncs to the Mac, the bridge
// sees it, runs the full harness, and replies in that thread. Native iMessage,
// no third-party service. Only watches your own self-chats and only acts on the
// trigger prefix, so it never fires on normal conversations.
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { config } from "./config.js";
import { getSetting, setSetting } from "./settings.js";
import { sendToGroup, sendImessage } from "./macos/imessageSend.js";
import { messageText } from "./macos/imessageText.js";
import { stripMarkdown } from "./format.js";
import { chatOnce } from "./harness/loop.js";
import type { Agent } from "./harness/types.js";

const POLL_MS = 6000;
const LAST_KEY = "imsg_bridge_last_rowid";

interface SelfChat {
  rowid: number;
  guid: string;
}

// All 1:1 chats whose identifier matches one of the user's self-handles
// (phone by last-10-digits, or Apple ID email). There can be more than one.
function findSelfChats(db: Database.Database): SelfChat[] {
  const handles = config.imessageSelfHandles.map((h) => h.toLowerCase());
  const digits = handles.map((h) => h.replace(/\D/g, "").slice(-10)).filter((d) => d.length === 10);
  const emails = handles.filter((h) => h.includes("@"));
  const chats = db.prepare(`SELECT ROWID AS rowid, guid, chat_identifier AS ci FROM chat WHERE style = 45`).all() as {
    rowid: number;
    guid: string;
    ci: string | null;
  }[];
  const out: SelfChat[] = [];
  for (const c of chats) {
    const ci = (c.ci ?? "").toLowerCase();
    if (emails.includes(ci) || digits.includes(ci.replace(/\D/g, "").slice(-10))) {
      out.push({ rowid: c.rowid, guid: c.guid });
    }
  }
  return out;
}

export function startImessageBridge(worker: Agent): void {
  if (config.imessageSelfHandles.length === 0) return;
  if (!existsSync(config.imessageDbPath)) return;

  const trigger = config.imessageBridgeTrigger.toLowerCase();
  console.log(`[bridge] armed — text yourself "${trigger} <query>" (self: ${config.imessageSelfHandles.join(", ")}).`);

  let busy = false;
  let announced = false;

  setInterval(async () => {
    if (busy) return;
    busy = true;
    let db: Database.Database | null = null;
    try {
      db = new Database(config.imessageDbPath, { readonly: true, fileMustExist: true });
      const selfChats = findSelfChats(db);
      if (selfChats.length === 0) return; // text yourself once to create the thread
      if (!announced) {
        console.log(`[bridge] watching ${selfChats.length} self-chat(s), listening.`);
        announced = true;
      }
      const chatById = new Map(selfChats.map((c) => [c.rowid, c.guid]));
      const ids = selfChats.map((c) => c.rowid);
      const ph = ids.map(() => "?").join(",");

      // Lazy cursor init: start from "now" so we don't replay history.
      if (!getSetting(LAST_KEY)) {
        const mx = (db.prepare(`SELECT COALESCE(MAX(m.ROWID),0) AS mx FROM chat_message_join cmj JOIN message m ON m.ROWID = cmj.message_id WHERE cmj.chat_id IN (${ph})`).get(...ids) as { mx: number }).mx;
        setSetting(LAST_KEY, String(mx));
      }
      const last = Number(getSetting(LAST_KEY, "0"));

      const rows = db
        .prepare(
          `SELECT m.ROWID AS rowid, m.text AS text, m.attributedBody AS ab, cmj.chat_id AS cid
           FROM chat_message_join cmj JOIN message m ON m.ROWID = cmj.message_id
           WHERE cmj.chat_id IN (${ph}) AND m.ROWID > ?
           ORDER BY m.ROWID ASC LIMIT 20`,
        )
        .all(...ids, last) as { rowid: number; text: string | null; ab: Buffer | null; cid: number }[];

      let newLast = last;
      for (const r of rows) {
        newLast = Math.max(newLast, r.rowid);
        // Self-chat: either direction is fine (it's you talking to you). Just need the trigger.
        const body = messageText(r.text, r.ab);
        if (!body.toLowerCase().startsWith(trigger)) continue;
        const query = body.slice(trigger.length).replace(/^[:,\s]+/, "").trim();
        if (!query) continue;
        console.log(`[bridge] query: ${query.slice(0, 60)}`);
        const guid = chatById.get(r.cid)!;
        // Stable per-self-chat threadKey → multi-turn stateful (loop.ts maps it to
        // a persistent thread + loads history), so a clarifying question and the
        // user's reply cohere instead of each text running fresh.
        const reply = stripMarkdown(await chatOnce(query, worker, `imessage:${guid}`)).slice(0, 1500);
        const sent = await sendToGroup(guid, reply);
        if (!sent.ok && config.imessageSelfHandles[0]) await sendImessage(config.imessageSelfHandles[0], reply);
      }
      if (newLast !== last) setSetting(LAST_KEY, String(newLast));
    } catch {
      /* transient (db locked, etc.) — try next tick */
    } finally {
      db?.close();
      busy = false;
    }
  }, POLL_MS);
}
