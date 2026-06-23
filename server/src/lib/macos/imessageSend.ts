// The ONLY code that sends an iMessage. Drives Messages.app via AppleScript.
// Requires macOS Automation permission (first run prompts to allow controlling
// Messages). Reached only from the approve endpoint — never directly by the agent.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { resolveHandle } from "../contacts.js";

const exec = promisify(execFile);

// AppleScript string-literal escaping: backslash and double-quote.
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function sendImessage(handle: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const h = esc(handle);
  const b = esc(body);
  // Form A (most reliable on macOS 14/15): buddy of an iMessage *service*.
  const formA = `tell application "Messages"
  set svc to 1st service whose service type = iMessage
  send "${b}" to buddy "${h}" of svc
end tell`;
  // Form B (fallback): participant of an iMessage *account*.
  const formB = `tell application "Messages"
  set acc to 1st account whose service type = iMessage
  send "${b}" to participant "${h}" of acc
end tell`;

  const tryScript = async (script: string) => {
    await exec("osascript", ["-e", script], { timeout: 15_000 });
  };

  try {
    await tryScript(formA);
    return { ok: true };
  } catch (errA) {
    try {
      await tryScript(formB);
      return { ok: true };
    } catch (errB) {
      const msg = String((errB as { stderr?: string }).stderr || errB) + " | A: " + String((errA as { stderr?: string }).stderr || errA);
      const hint = /not authorized|Automation|1743/i.test(msg)
        ? " — allow this process to control Messages in System Settings → Privacy & Security → Automation."
        : /Can.t get|invalid|doesn.t understand/i.test(msg)
          ? " — the handle may not be reachable via iMessage (green-bubble/SMS contacts can't be sent this way)."
          : "";
      return { ok: false, error: msg.slice(0, 300) + hint };
    }
  }
}

/** Send a file (e.g. the MedMorphIQ one-pager) to a 1:1 handle. */
export async function sendImessageFile(handle: string, filePath: string): Promise<{ ok: boolean; error?: string }> {
  const script = `tell application "Messages"
  set svc to 1st service whose service type = iMessage
  send POSIX file "${esc(filePath)}" to buddy "${esc(handle)}" of svc
end tell`;
  try {
    await exec("osascript", ["-e", script], { timeout: 20_000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as { stderr?: string }).stderr || err).slice(0, 200) };
  }
}

/** Send a file to a group chat by guid. */
export async function sendFileToGroup(guid: string, filePath: string): Promise<{ ok: boolean; error?: string }> {
  const script = `tell application "Messages" to send POSIX file "${esc(filePath)}" to chat id "${esc(guid)}"`;
  try {
    await exec("osascript", ["-e", script], { timeout: 20_000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as { stderr?: string }).stderr || err).slice(0, 200) };
  }
}

/** Send to an existing group chat by its chat.db guid. */
export async function sendToGroup(guid: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const g = esc(guid);
  const b = esc(body);
  const formA = `tell application "Messages" to send "${b}" to chat id "${g}"`;
  const formB = `tell application "Messages"
  set targetChat to a reference to text chat id "${g}"
  send "${b}" to targetChat
end tell`;
  try {
    await exec("osascript", ["-e", formA], { timeout: 15_000 });
    return { ok: true };
  } catch (errA) {
    try {
      await exec("osascript", ["-e", formB], { timeout: 15_000 });
      return { ok: true };
    } catch (errB) {
      const msg = String((errB as { stderr?: string }).stderr || errB);
      return { ok: false, error: msg.slice(0, 300) };
    }
  }
}

/** Resolve a group-chat name (e.g. "Tennis boys") → its chat.db guid. */
export function resolveGroupChat(query: string): { guid: string; name: string } | null {
  const needle = query
    .toLowerCase()
    .replace(/\b(group ?chat|group|the|gc)\b/g, "")
    .trim();
  if (!needle) return null;
  let db: Database.Database | null = null;
  try {
    db = new Database(config.imessageDbPath, { readonly: true, fileMustExist: true });
    const groups = db
      .prepare(`SELECT guid, display_name AS dn, chat_identifier AS ci FROM chat WHERE style = 43`)
      .all() as { guid: string; dn: string | null; ci: string }[];
    // 1) match on the group's display name
    for (const g of groups) {
      if (g.dn && g.dn.toLowerCase().includes(needle)) return { guid: g.guid, name: g.dn };
    }
    // 2) fallback: a group whose member names collectively match (e.g. "tennis boys")
    for (const g of groups) {
      const members = (
        db
          .prepare(
            `SELECT h.id AS id FROM chat_handle_join chj JOIN chat c ON c.ROWID = chj.chat_id JOIN handle h ON h.ROWID = chj.handle_id WHERE c.guid = ?`,
          )
          .all(g.guid) as { id: string }[]
      )
        .map((m) => resolveHandle(m.id)?.toLowerCase() ?? "")
        .join(" ");
      if (needle.split(/\s+/).some((w) => w.length >= 3 && members.includes(w))) {
        return { guid: g.guid, name: g.dn || "group" };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Resolve a contact name → a deliverable iMessage handle, using chat.db (handles
 * we've actually conversed with are the most reliable send targets).
 */
export function resolveSendHandle(query: string): { handle: string; name: string | null } | null {
  const needle = query.toLowerCase().trim();
  // If it's already a phone/email, use it directly.
  if (/@/.test(query) || /\+?\d[\d\s().-]{6,}/.test(query)) {
    return { handle: query.replace(/[^\d+@._-]/g, ""), name: resolveHandle(query) };
  }
  let db: Database.Database | null = null;
  try {
    db = new Database(config.imessageDbPath, { readonly: true, fileMustExist: true });
    const handles = db.prepare(`SELECT ROWID AS rowid, id FROM handle`).all() as { rowid: number; id: string }[];
    let best: { handle: string; name: string | null; rowid: number } | null = null;
    for (const h of handles) {
      const name = resolveHandle(h.id);
      if (name?.toLowerCase().includes(needle) || h.id.toLowerCase().includes(needle)) {
        // prefer the most-recently-used handle for reliability
        const last = db
          .prepare(`SELECT MAX(date) AS d FROM message WHERE handle_id = ?`)
          .get(h.rowid) as { d: number | null };
        if (!best || (last.d ?? 0) > (best.rowid ?? 0)) best = { handle: h.id, name, rowid: last.d ?? 0 };
      }
    }
    return best ? { handle: best.handle, name: best.name } : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
