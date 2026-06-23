// Telegram bridge — a dedicated "Solo" contact you text back and forth from your
// phone. Clean conversation thread, no prefix, no note-to-self mess. Uses long-
// polling (getUpdates), so no public URL needed. Locks to the first chat that
// messages it (you), and ignores everyone else.
import { config } from "./config.js";
import { getSetting, setSetting } from "./settings.js";
import { chatOnce } from "./harness/loop.js";
import { toTelegramHtml, stripMarkdown } from "./format.js";
import type { Agent } from "./harness/types.js";

interface TgUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number } };
}

export function startTelegramBridge(worker: Agent): void {
  const token = config.telegramBotToken;
  if (!token) return;
  const API = `https://api.telegram.org/bot${token}`;
  let offset = Number(getSetting("telegram_offset", "0"));
  let busy = false;

  console.log("[telegram] bridge live — DM your bot to talk to Solo.");

  async function action(chatId: number, kind: "typing") {
    await fetch(`${API}/sendChatAction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, action: kind }) }).catch(() => {});
  }

  async function send(chatId: number, text: string) {
    const html = toTelegramHtml(text).slice(0, 4000);
    // Try rich HTML; if Telegram rejects the entities, fall back to clean plain text.
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    }).catch(() => null);
    const ok = res && ((await res.json().catch(() => ({}))) as { ok?: boolean }).ok;
    if (!ok) {
      await fetch(`${API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: stripMarkdown(text).slice(0, 4000) }),
      }).catch(() => {});
    }
  }

  const loop = async () => {
    if (busy) return setTimeout(loop, 1000);
    busy = true;
    try {
      const res = await fetch(`${API}/getUpdates?timeout=25&offset=${offset}`, { signal: AbortSignal.timeout(30_000) });
      const data = (await res.json()) as { ok: boolean; result?: TgUpdate[] };
      for (const u of data.result ?? []) {
        offset = u.update_id + 1;
        const text = u.message?.text?.trim();
        const chatId = u.message?.chat.id;
        if (!text || chatId === undefined) continue;

        // Lock to the first chat that talks to the bot (you).
        const owner = getSetting("telegram_owner_chat", "");
        if (!owner) setSetting("telegram_owner_chat", String(chatId));
        else if (owner !== String(chatId)) {
          await send(chatId, "this Solo instance is private.");
          continue;
        }

        if (text === "/start") {
          await send(chatId, "hey, i'm Solo. ask me anything: your morning brief, your texts, your email, jobs, who to reach out to. just talk to me like normal.");
          continue;
        }

        await action(chatId, "typing");
        // Pass a stable per-chat threadKey so the conversation is multi-turn
        // stateful (loop.ts maps it to a persistent thread + loads history): a
        // clarifying question and the user's answer now share context.
        const reply = await chatOnce(text, worker, `telegram:${chatId}`);
        await send(chatId, reply || "(done)");
      }
      setSetting("telegram_offset", String(offset));
    } catch {
      /* network blip / timeout — back off a touch */
    } finally {
      busy = false;
      setTimeout(loop, 1000);
    }
  };
  loop();
}
