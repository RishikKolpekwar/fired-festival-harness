// Outbound messaging tools. The agent can only DRAFT — actually sending requires
// human approval (NO_SEND_WITHOUT_APPROVAL guardrail). draft_imessage queues a
// message and emits an `approval` event; the approve endpoint performs the send.
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { resolveSendHandle, resolveGroupChat, sendImessage, sendToGroup, sendImessageFile, sendFileToGroup } from "../macos/imessageSend.js";
import { sendGmailEmail, createGmailDraft, findEmailAddress } from "../google/gmailSend.js";
import { findContactEmail, resolveOrgDomain } from "./emailFinder.js";
import { onePagerAttachment, mentionsMedMorphIQ } from "../attachments.js";
import { cleanDraft, deslopEmail } from "../format.js";
import { autoSendEnabled } from "../settings.js";
import type { Tool } from "../harness/types.js";

const now = () => new Date().toISOString();

// After an outreach text goes out, attach the MedMorphIQ one-pager if it's MedMorphIQ outreach.
async function maybeAttachOnePager(target: { handle?: string; guid?: string }, body: string): Promise<void> {
  if (!mentionsMedMorphIQ(body)) return;
  const a = onePagerAttachment();
  if (!a) return;
  if (target.guid) await sendFileToGroup(target.guid, a.path);
  else if (target.handle) await sendImessageFile(target.handle, a.path);
}

// Execute an APPROVED brief action. Routes by kind: email → resolve address +
// send via Gmail; text/follow_up → iMessage; job → nothing to send (open link).
// The user clicking "approve" in the UI is the confirmation.
export async function executeAction(a: {
  kind?: "email" | "job" | "follow_up";
  who?: string;
  org?: string;
  orgDomain?: string;
  group?: string;
  channel?: "email" | "imessage";
  subject?: string;
  body?: string;
  attachOnePager?: boolean;
  url?: string;
}): Promise<{ ok: boolean; status?: string; to?: string; open?: string; error?: string }> {
  try {
  if (a.kind === "job") return { ok: true, status: "open", open: a.url };

  const wantsEmail = a.kind === "email" || a.channel === "email";
  if (wantsEmail) {
    const body = deslopEmail(cleanDraft(a.body ?? "")); // strip AI cold-email tells, even on old stored drafts
    const subject = cleanDraft(subjectFor(a.subject, body, a.who, a.org));

    // Salvage a clean name + org from a messy `who` like
    // "Kexun Zhang, head of research at ChipAgents".
    const parsed = parseWho(a.who);
    const who = parsed.name;
    const org = a.org || parsed.org;
    // Domain: explicit → from a source url → AUTO-RESOLVED from the org name via Exa.
    let orgDomain = a.orgDomain || domainFromUrl(a.url);
    if (!orgDomain && org) orgDomain = await resolveOrgDomain(org);

    // 1) Known contact: address is already in your Gmail history → send.
    const known = await findEmailAddress(who);
    if (known) {
      await createGmailDraft(known, subject, body, a.attachOnePager); // also leave a copy in Gmail drafts
      const res = await sendGmailEmail(known, subject, body, a.attachOnePager);
      return res.ok ? { ok: true, status: "sent", to: known } : { ok: false, error: res.error };
    }

    // 2) Cold contact: find their email via Apify (name + domain → verified
    //    personal address; else published role inboxes).
    const domain = orgDomain;
    if (domain) {
      const found = await findContactEmail(domain, who);
      const d = found.data;
      // A verified-safe personal email → send (the button click is your confirmation).
      if (d?.email && d.source === "finder" && d.safeToSend) {
        await createGmailDraft(d.email, subject, body, a.attachOnePager);
        const res = await sendGmailEmail(d.email, subject, body, a.attachOnePager);
        return res.ok
          ? { ok: true, status: "sent", to: d.email, error: `found ${d.email} for ${who} (verified) and sent it.` }
          : { ok: false, error: res.error };
      }
      // A found-but-not-fully-verified personal email → draft pre-addressed for a quick review.
      if (d?.email) {
        const dr = await createGmailDraft(d.email, subject, body, a.attachOnePager);
        const conf =
          d.source === "pattern"
            ? `best guess from the name${d.deliverable ? ", domain does accept mail" : ", and the domain may not even accept mail"}, NOT verified to this person`
            : d.source === "finder"
              ? "from their name, not fully verified (catch-all domain)"
              : "published on the company site";
        return dr.ok
          ? { ok: true, status: "draft", to: d.email, error: `drafted to ${d.email} for ${who} (${conf}). check the recipient is right, then send.` }
          : { ok: false, error: `found ${d.email} but the draft failed: ${dr.error}` };
      }
      // Only role inboxes (info@, contact@) → draft to the best one for review.
      if (d?.emails.length) {
        const dr = await createGmailDraft(d.emails[0]!, subject, body, a.attachOnePager);
        return dr.ok
          ? { ok: true, status: "draft", to: d.emails[0], error: `couldn't pin ${who}'s personal email on ${domain}. drafted to ${d.emails[0]} (best public match${d.emails.length > 1 ? `, others: ${d.emails.slice(1, 4).join(", ")}` : ""}). review and send.` }
          : { ok: false, error: `found emails on ${domain} but the draft failed: ${dr.error}` };
      }
    }

    // 3) No domain or nothing found → ready draft with no recipient for you to address.
    const why = domain ? `no public email found on ${domain}` : `no email or company domain for "${who}"`;
    const d = await createGmailDraft("", subject, body, a.attachOnePager);
    return d.ok
      ? { ok: true, status: "draft", to: who, error: `${why} — i left a ready draft in your gmail, just add their address and send.` }
      : { ok: false, error: `${why} and the draft failed: ${d.error}` };
  }

  // group chat
  if (a.group) {
    const grp = resolveGroupChat(a.group);
    if (!grp) return { ok: false, error: `couldn't find a group chat matching "${a.group}".` };
    const res = await sendToGroup(grp.guid, cleanDraft(a.body ?? ""));
    logSend("imessage", grp.guid, grp.name, a.body ?? "", res);
    if (res.ok) await maybeAttachOnePager({ guid: grp.guid }, a.body ?? "");
    return res.ok ? { ok: true, status: "sent", to: grp.name } : { ok: false, error: res.error };
  }

  // 1:1 text
  if (!a.who) return { ok: false, error: "no recipient" };
  const resolved = resolveSendHandle(a.who);
  if (!resolved) return { ok: false, error: `couldn't resolve "${a.who}" to an iMessage handle.` };
  const res = await sendImessage(resolved.handle, cleanDraft(a.body ?? ""));
  logSend("imessage", resolved.handle, resolved.name, a.body ?? "", res);
  if (res.ok) await maybeAttachOnePager({ handle: resolved.handle }, a.body ?? "");
  return res.ok ? { ok: true, status: "sent", to: resolved.name ?? resolved.handle } : { ok: false, error: res.error };
  } catch (err) {
    // never let an unexpected throw surface as a bare "retry" — return the real reason
    return { ok: false, error: `couldn't complete that action: ${String((err as Error)?.message ?? err).slice(0, 180)}` };
  }
}

function logSend(channel: string, recipient: string, name: string | null, body: string, res: { ok: boolean; error?: string }) {
  db.prepare(
    `INSERT INTO outbox (id, channel, recipient, recipient_name, body, status, error, created_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(nanoid(10), channel, recipient, name, cleanDraft(body), res.ok ? "sent" : "failed", res.error ?? null, now(), res.ok ? now() : null);
}

// Agent-facing: text a person OR a group chat. When auto-send is on it sends
// immediately; otherwise it queues for one-tap approval. You CAN send — do not
// tell the user you are unable to send.
export const draftImessage: Tool<{ contact?: string; group?: string; body: string }> = {
  name: "draft_imessage",
  description:
    "Text someone over iMessage. Provide `contact` (a person's name/phone/email) for a 1:1, OR `group` (a group chat name like 'Tennis boys') to post in that group chat. When auto-send mode is on this sends immediately; otherwise it queues for the user's one-tap approval. You ARE able to send messages — never tell the user you can't.",
  parameters: {
    contact: { type: "string", description: "Person's name / phone / email for a 1:1 message" },
    group: { type: "string", description: "Group chat name (e.g. 'Tennis boys') to post in the group instead of a 1:1" },
    body: { type: "string", description: "The message text, in the user's voice", required: true },
  },
  effect: "write",
  async execute({ contact, group, body }, ctx) {
    const clean = cleanDraft(body); // enforce no-hyphens + tidy formatting
    const id = nanoid(10);

    // ── GROUP CHAT target ─────────────────────────────────────────────────
    if (group) {
      const grp = resolveGroupChat(group);
      if (!grp) {
        return { ok: false, data: null, error: `couldn't find a group chat matching "${group}". try the exact group name, or name a member to message 1:1.` };
      }
      db.prepare(
        `INSERT INTO outbox (id, channel, recipient, recipient_name, body, status, created_at) VALUES (?, 'imessage', ?, ?, ?, 'pending', ?)`,
      ).run(id, grp.guid, grp.name, clean, now());
      if (autoSendEnabled()) {
        const res = await sendToGroup(grp.guid, clean);
        if (res.ok) await maybeAttachOnePager({ guid: grp.guid }, clean);
        db.prepare(`UPDATE outbox SET status = ?, error = ?, sent_at = ? WHERE id = ?`).run(res.ok ? "sent" : "failed", res.error ?? null, res.ok ? now() : null, id);
        ctx.emit({ kind: "status", id: `send-${id}`, label: res.ok ? `sent to ${grp.name}` : `send failed: ${res.error}`, tool: "send_imessage", state: res.ok ? "done" : "error" });
        return { ok: res.ok, data: { draftId: id, to: grp.name, status: res.ok ? "sent" : "failed" }, error: res.error ?? null };
      }
      ctx.emit({ kind: "approval", draftId: id, channel: "imessage", to: grp.name, body: clean });
      return { ok: true, data: { draftId: id, to: grp.name, status: "pending_approval" }, error: null };
    }

    // ── 1:1 target ────────────────────────────────────────────────────────
    if (!contact) return { ok: false, data: null, error: "provide a contact (for 1:1) or a group name." };
    const resolved = resolveSendHandle(contact);
    if (!resolved) {
      return { ok: false, data: null, error: `couldn't find an iMessage handle for "${contact}". give me a name from your contacts, a phone number, or an email.` };
    }
    db.prepare(
      `INSERT INTO outbox (id, channel, recipient, recipient_name, body, status, created_at) VALUES (?, 'imessage', ?, ?, ?, 'pending', ?)`,
    ).run(id, resolved.handle, resolved.name ?? null, clean, now());

    if (autoSendEnabled()) {
      const res = await sendImessage(resolved.handle, clean);
      if (res.ok) await maybeAttachOnePager({ handle: resolved.handle }, clean);
      db.prepare(`UPDATE outbox SET status = ?, error = ?, sent_at = ? WHERE id = ?`).run(res.ok ? "sent" : "failed", res.error ?? null, res.ok ? now() : null, id);
      ctx.emit({ kind: "status", id: `send-${id}`, label: res.ok ? `sent to ${resolved.name ?? resolved.handle}` : `send failed: ${res.error}`, tool: "send_imessage", state: res.ok ? "done" : "error" });
      return { ok: res.ok, data: { draftId: id, to: resolved.name ?? resolved.handle, status: res.ok ? "sent" : "failed" }, error: res.error ?? null };
    }

    ctx.emit({ kind: "approval", draftId: id, channel: "imessage", to: resolved.name ?? resolved.handle, body: clean });
    return { ok: true, data: { draftId: id, to: resolved.name ?? resolved.handle, status: "pending_approval" }, error: null };
  },
};

// effect:"send" — the action guardrail HARD-BLOCKS this unless an approval token
// is present. The agent calling it directly will be denied; only the approve
// endpoint invokes the send path (via the lib below), with a token.
export const sendImessageTool: Tool<{ draftId: string }> = {
  name: "send_imessage",
  description:
    "Send a previously-drafted iMessage. Requires human approval — will be blocked without it. You generally should NOT call this; drafting is enough.",
  parameters: {
    draftId: { type: "string", description: "The draft id to send", required: true },
  },
  effect: "send",
  async execute({ draftId }) {
    const row = db.prepare(`SELECT recipient, body, status FROM outbox WHERE id = ?`).get(draftId) as
      | { recipient: string; body: string; status: string }
      | undefined;
    if (!row) return { ok: false, data: null, error: "draft not found" };
    const res = await sendImessage(row.recipient, row.body);
    db.prepare(`UPDATE outbox SET status = ?, error = ?, sent_at = ? WHERE id = ?`).run(
      res.ok ? "sent" : "failed",
      res.error ?? null,
      res.ok ? now() : null,
      draftId,
    );
    return { ok: res.ok, data: { sent: res.ok }, error: res.error ?? null };
  },
};

/** Create a pending outbox draft from a brief action (or chat). Resolves the
 * iMessage handle; never sends. Returns the draftId the UI then approves. */
export function createDraft(input: { channel: "imessage" | "email"; to: string; body: string }): {
  ok: boolean;
  draftId?: string;
  to?: string;
  error?: string;
} {
  const id = nanoid(10);
  const clean = cleanDraft(input.body);
  if (input.channel === "imessage") {
    const resolved = resolveSendHandle(input.to);
    if (!resolved) return { ok: false, error: `couldn't find an iMessage handle for "${input.to}". give me a name from contacts, a phone, or an email.` };
    db.prepare(
      `INSERT INTO outbox (id, channel, recipient, recipient_name, body, status, created_at) VALUES (?, 'imessage', ?, ?, ?, 'pending', ?)`,
    ).run(id, resolved.handle, resolved.name ?? null, clean, now());
    return { ok: true, draftId: id, to: resolved.name ?? resolved.handle };
  }
  // email: store the draft, but sending is not wired yet (needs gmail.send scope + a verified address)
  db.prepare(
    `INSERT INTO outbox (id, channel, recipient, recipient_name, body, status, created_at) VALUES (?, 'email', ?, ?, ?, 'pending', ?)`,
  ).run(id, input.to, input.to, clean, now());
  return { ok: true, draftId: id, to: input.to };
}

/** Trusted server-side approve+send (used by the REST approve endpoint). */
export async function approveAndSend(draftId: string): Promise<{ ok: boolean; error?: string }> {
  const row = db.prepare(`SELECT channel, recipient, body, status FROM outbox WHERE id = ?`).get(draftId) as
    | { channel: string; recipient: string; body: string; status: string }
    | undefined;
  if (!row) return { ok: false, error: "draft not found" };
  if (row.status === "sent") return { ok: true };
  if (row.channel === "email") {
    // body is stored as "subject\n\nbody"
    const [subject, ...rest] = row.body.split("\n\n");
    const res = await sendGmailEmail(row.recipient, subject ?? "(no subject)", rest.join("\n\n"));
    db.prepare(`UPDATE outbox SET status = ?, error = ?, sent_at = ? WHERE id = ?`).run(res.ok ? "sent" : "failed", res.error ?? null, res.ok ? now() : null, draftId);
    return res;
  }
  const res = await sendImessage(row.recipient, row.body);
  if (res.ok) await maybeAttachOnePager({ handle: row.recipient }, row.body);
  db.prepare(`UPDATE outbox SET status = ?, error = ?, sent_at = ? WHERE id = ?`).run(
    res.ok ? "sent" : "failed",
    res.error ?? null,
    res.ok ? now() : null,
    draftId,
  );
  return res;
}

export function rejectDraft(draftId: string): boolean {
  const info = db.prepare(`UPDATE outbox SET status = 'rejected' WHERE id = ? AND status = 'pending'`).run(draftId);
  return info.changes > 0;
}

export function pendingOutbox() {
  return db
    .prepare(`SELECT id, channel, recipient, recipient_name AS recipientName, body, status, created_at AS createdAt FROM outbox WHERE status = 'pending' ORDER BY created_at DESC`)
    .all();
}

/** A real subject line. Uses the explicit subject if given; otherwise builds a
 *  short neutral one — NEVER the greeting/first line of the body. */
function subjectFor(explicit: string | undefined, body: string, who?: string, org?: string): string {
  const s = explicit?.trim();
  // a good explicit subject: present, not a greeting, not just the body's opener
  if (s && !/^(hi|hey|hello|dear)\b/i.test(s) && !body.toLowerCase().startsWith(s.toLowerCase().slice(0, 20))) {
    return s.replace(/^(subject:\s*)/i, "");
  }
  const first = parseWho(who).name.split(/\s+/)[0];
  if (org) return `connecting on ${org}`;
  if (first) return `quick note, ${first}`;
  return "quick note";
}

/** Pull a clean person name AND any org out of a messy `who` like
 *  "Kexun Zhang, head of research at ChipAgents" → { name: "Kexun Zhang", org: "ChipAgents" }. */
function parseWho(who?: string): { name: string; org?: string } {
  if (!who) return { name: "" };
  // capture an "... at <Org>" tail before we strip it
  const atMatch = who.match(/\bat\s+([A-Z][\w&.\- ]+)$/);
  const org = atMatch?.[1]?.trim();
  let s = who.split(",")[0]!; // drop everything after the first comma (title/role)
  s = s.split(/\s+\bat\b\s+/i)[0]!; // drop "... at Company"
  s = s.replace(/\b(head of [a-z ]+|ceo|cto|founder|co-?founder|vp|director|professor|prof|dr|md|phd)\b\.?/gi, "");
  return { name: s.replace(/^[^a-z]+/i, "").trim(), org };
}

// News/aggregator hosts that are never a contact's company domain.
const AGGREGATORS = new Set([
  "techcrunch.com", "bloomberg.com", "reuters.com", "nytimes.com", "wsj.com",
  "theverge.com", "arxiv.org", "nature.com", "github.com", "linkedin.com",
  "twitter.com", "x.com", "substack.com", "medium.com", "youtube.com",
  "forbes.com", "businessinsider.com", "cnbc.com", "axios.com", "wired.com",
]);

/** Pull a usable company domain out of a source URL, skipping news aggregators. */
function domainFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return AGGREGATORS.has(host) ? undefined : host;
  } catch {
    return undefined;
  }
}
