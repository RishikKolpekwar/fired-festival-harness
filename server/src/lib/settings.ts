// Runtime settings, db-backed. Notably `auto_send`: when on, the harness treats
// the user as having granted standing approval for sends (the NO_SEND_WITHOUT_
// APPROVAL guardrail is configured to allow, not removed — every send is still
// logged to the outbox for an audit trail).
import { db } from "./db.js";

export function getSetting(key: string, fallback = ""): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function autoSendEnabled(): boolean {
  return getSetting("auto_send", "false") === "true";
}

export function setAutoSend(on: boolean): void {
  setSetting("auto_send", on ? "true" : "false");
}
