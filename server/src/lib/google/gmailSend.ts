// Gmail outbound: resolve a recipient address from history, fetch full bodies,
// create a Gmail draft (you send from Gmail), or send via gmail.send (Solo
// confirm path). Requires the gmail.compose + gmail.send scopes (re-consent).
import { getAccessToken, hasGoogleAuth } from "./auth.js";
import { onePagerFor, onePagerAttachment, type Attachment } from "../attachments.js";

/** Decide the attachment: explicit toggle wins (true=force one-pager, false=none);
 *  undefined falls back to the MedMorphIQ heuristic. */
function chooseAttachment(text: string, attach?: boolean): Attachment | null {
  if (attach === true) return onePagerAttachment();
  if (attach === false) return null;
  return onePagerFor(text);
}

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render the plain-text body as reflowable HTML so the email is never a narrow
 *  fixed-width column: blank-line-separated blocks become <p> (preserves the
 *  paragraph spacing AND lets each paragraph reflow to the reader's full width),
 *  single newlines become <br>, and bare URLs become links. */
export function textToHtml(bodyRaw: string): string {
  const paras = bodyRaw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+$/gm, ""))
    .filter((p) => p.trim());
  // escape first, then linkify (an escaped "&amp;" in an href is valid HTML and
  // resolves to the real "&", so query-string URLs survive intact).
  const linkify = (s: string) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const body = paras.map((p) => `<p style="margin:0 0 1em 0;">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;">${body}</div>`;
}

/** base64 a MIME part body, hard-wrapped at 76 cols per RFC 2045 (keeps every
 *  line well under the 998-char limit without any client-visible wrapping). */
function b64Part(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function rfc822(to: string, subject: string, bodyRaw: string, attachment?: Attachment | null): string {
  // Two representations: text/plain keeps the exact line breaks the user typed
  // (CRLF per RFC 822) for plain-only clients; text/html reflows to the reader's
  // width so the body flows full-width instead of a narrow ~60-char column.
  const plain = bodyRaw.replace(/\r?\n/g, "\r\n");
  const html = textToHtml(bodyRaw);
  // Empty `to` is valid: Gmail accepts a draft with no recipient (you fill it in).
  const toLine = to ? [`To: ${to}`] : [];

  // multipart/alternative: plain fallback + reflowing HTML (clients prefer HTML).
  const alt = `alt_${Date.now().toString(36)}`;
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Part(plain),
    "",
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Part(html),
    "",
    `--${alt}--`,
  ];

  let msg: string;
  if (!attachment) {
    msg = [...toLine, `Subject: ${subject}`, "MIME-Version: 1.0", ...altPart].join("\r\n");
  } else {
    const b = `mix_${Date.now().toString(36)}`;
    const wrapped = attachment.base64.replace(/(.{76})/g, "$1\r\n");
    msg = [
      ...toLine,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${b}"`,
      "",
      `--${b}`,
      // nest the alternative (plain + html) as the first body part
      ...altPart,
      "",
      `--${b}`,
      `Content-Type: ${attachment.mime}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      wrapped,
      "",
      `--${b}--`,
    ].join("\r\n");
  }
  return Buffer.from(msg, "utf8").toString("base64url");
}

/** Find a person's email address from prior Gmail correspondence. */
export async function findEmailAddress(name: string): Promise<string | null> {
  if (name.includes("@")) return name.trim();
  if (!hasGoogleAuth()) return null;
  try {
    const token = await getAccessToken();
    const auth = { Authorization: `Bearer ${token}` };
    const q = encodeURIComponent(`from:${name} OR to:${name}`);
    const list = (await (await fetch(`${API}/messages?q=${q}&maxResults=5`, { headers: auth })).json()) as { messages?: { id: string }[] };
    for (const m of list.messages ?? []) {
      const full = (await (await fetch(`${API}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To`, { headers: auth })).json()) as {
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = full.payload?.headers ?? [];
      const needle = name.toLowerCase();
      for (const h of headers) {
        // Find an address whose display name or local part matches the query.
        for (const match of h.value.matchAll(/("?([^"<]*)"?\s*)?<?([\w.+-]+@[\w.-]+)>?/g)) {
          const display = (match[2] ?? "").toLowerCase();
          const addr = match[3]!;
          if (display.includes(needle) || addr.toLowerCase().includes(needle.replace(/\s+/g, ""))) return addr;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Fetch a full plain-text email body by message id (for reply context). */
export async function getFullEmailBody(messageId: string): Promise<string | null> {
  if (!hasGoogleAuth()) return null;
  try {
    const token = await getAccessToken();
    const full = (await (await fetch(`${API}/messages/${messageId}?format=full`, { headers: { Authorization: `Bearer ${token}` } })).json()) as {
      payload?: unknown;
    };
    return extractBody(full.payload);
  } catch {
    return null;
  }
}

function extractBody(payload: unknown): string {
  const p = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const part of p.parts ?? []) {
    const t = extractBody(part);
    if (t) return t;
  }
  return "";
}

/** Create a Gmail draft (lands in the user's Drafts to review + send). */
export async function createGmailDraft(to: string, subject: string, body: string, attach?: boolean): Promise<{ ok: boolean; draftId?: string; error?: string }> {
  if (!hasGoogleAuth()) return { ok: false, error: "Google not connected" };
  try {
    const token = await getAccessToken();
    const resp = await fetch(`${API}/drafts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: rfc822(to, subject, body, chooseAttachment(`${subject}\n${body}`, attach)) } }),
    });
    if (!resp.ok) return { ok: false, error: `gmail draft ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    const d = (await resp.json()) as { id: string };
    return { ok: true, draftId: d.id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Send an email via gmail.send (the Solo-confirm path). */
export async function sendGmailEmail(to: string, subject: string, body: string, attach?: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!hasGoogleAuth()) return { ok: false, error: "Google not connected" };
  try {
    const token = await getAccessToken();
    const resp = await fetch(`${API}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: rfc822(to, subject, body, chooseAttachment(`${subject}\n${body}`, attach)) }),
    });
    if (!resp.ok) {
      const t = (await resp.text()).slice(0, 200);
      const hint = /insufficient|scope|PERMISSION/i.test(t) ? " — re-run `npm run google-auth` to grant the gmail.send scope." : "";
      return { ok: false, error: `gmail send ${resp.status}: ${t}${hint}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
