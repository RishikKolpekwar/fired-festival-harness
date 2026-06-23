// Material handling — Gmail (read-only). Surfaces recent unread/important mail
// that may need action or carries context. Never sends. Degrades gracefully if
// Google isn't connected.
import { nanoid } from "nanoid";
import { getAccessToken, hasGoogleAuth } from "../google/auth.js";
import type { Signal, Tool } from "../harness/types.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface MsgPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MsgPart[];
}
interface MsgMeta {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] } & MsgPart;
}

function header(m: MsgMeta, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(part: MsgPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const p of part.parts ?? []) {
    const t = extractBody(p);
    if (t) return t;
  }
  return "";
}

export const readGmail: Tool<{ query?: string; max?: number; full?: boolean }> = {
  name: "read_gmail",
  description:
    "Read Gmail (read-only). Default returns recent unread/important messages as snippets. Pass a `query` to find a specific person/thread — the search covers ALL mail INCLUDING SENT, so use it to check whether the user already emailed someone (search their email/name/company) BEFORE drafting outreach. `full: true` returns complete message bodies (use when drafting a reply/follow-up so you have the real context). Never sends.",
  parameters: {
    query: { type: "string", description: "Gmail search query (e.g. 'from:karan', default: unread or important, last 2 days)" },
    max: { type: "number", description: "Max messages (default 15, or 5 when full)" },
    full: { type: "boolean", description: "Fetch complete message bodies instead of snippets (for reply context)" },
  },
  effect: "read",
  async execute({ query = "(is:unread OR is:important) newer_than:2d", max, full = false }) {
    max = max ?? (full ? 5 : 15);
    if (!hasGoogleAuth()) {
      return { ok: false, data: null, error: "Google not connected — run `npm run google-auth`.", signals: [] };
    }
    try {
      const token = await getAccessToken();
      const auth = { Authorization: `Bearer ${token}` };

      const listRes = await fetch(`${API}/messages?q=${encodeURIComponent(query)}&maxResults=${max}`, { headers: auth });
      if (!listRes.ok) return { ok: false, data: null, error: `gmail list ${listRes.status}`, signals: [] };
      const list = (await listRes.json()) as { messages?: { id: string }[] };
      const ids = (list.messages ?? []).map((m) => m.id);

      const fmt = full
        ? "format=full"
        : "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date";
      const signals: Signal[] = [];
      for (const id of ids) {
        const r = await fetch(`${API}/messages/${id}?${fmt}`, { headers: auth });
        if (!r.ok) continue;
        const m = (await r.json()) as MsgMeta;
        const from = header(m, "From");
        const subject = header(m, "Subject") || "(no subject)";
        const bodyText = full ? extractBody(m.payload).slice(0, 4000) || (m.snippet ?? "") : (m.snippet ?? "").slice(0, 500);
        signals.push({
          id: nanoid(10),
          source: "gmail",
          title: `${subject} — ${from}`,
          body: bodyText,
          ts: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
          meta: { from, gmailId: id },
        });
      }
      return { ok: true, data: { count: signals.length }, error: null, signals };
    } catch (err) {
      return { ok: false, data: null, error: String(err), signals: [] };
    }
  },
};
