// Outbound email — compose in the user's voice and give two confirm paths:
//   (1) create a Gmail draft (review + send from Gmail), and
//   (2) queue in Solo so the user can confirm here (Solo sends via gmail.send).
// Never sends without one of those confirmations unless auto-send is on.
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { cleanDraft } from "../format.js";
import { createGmailDraft, findEmailAddress } from "../google/gmailSend.js";
import type { Tool } from "../harness/types.js";

const now = () => new Date().toISOString();

export const draftEmail: Tool<{ to: string; subject: string; body: string }> = {
  name: "draft_email",
  description:
    "Compose an email in the user's voice. Resolves the recipient's address from their Gmail history (or accepts an address directly). Creates a Gmail draft they can send from Gmail, AND queues it in Solo for one-tap confirm here. Does not send without confirmation (unless auto-send is on). Use when the user asks to email someone.",
  parameters: {
    to: { type: "string", description: "Recipient name (resolved from Gmail history) or an email address", required: true },
    subject: { type: "string", description: "Email subject", required: true },
    body: { type: "string", description: "Email body in the user's voice", required: true },
  },
  effect: "write",
  async execute({ to, subject, body }, ctx) {
    const address = await findEmailAddress(to);
    if (!address) {
      return { ok: false, data: null, error: `couldn't find an email address for "${to}" in your Gmail. give me their address and i'll draft it.` };
    }
    const cleanBody = cleanDraft(body);
    const cleanSubject = cleanDraft(subject);
    const id = nanoid(10);

    // Email is confirm-first ALWAYS (higher stakes than a text) — even when
    // auto-send is on. Create a Gmail draft (send from Gmail) AND queue in Solo
    // (confirm here → Solo sends via gmail.send). Never auto-fires.
    const gd = await createGmailDraft(address, cleanSubject, cleanBody);
    db.prepare(
      `INSERT INTO outbox (id, channel, recipient, recipient_name, body, status, created_at) VALUES (?, 'email', ?, ?, ?, 'pending', ?)`,
    ).run(id, address, to, `${cleanSubject}\n\n${cleanBody}`, now());

    ctx.emit({ kind: "approval", draftId: id, channel: "email", to: `${to} <${address}>`, body: `${cleanSubject}\n\n${cleanBody}` });
    return {
      ok: true,
      data: {
        draftId: id,
        to: address,
        gmailDraft: gd.ok ? "created in Gmail Drafts — review and send there, or confirm here" : `gmail draft failed: ${gd.error}`,
        status: "pending_confirm",
      },
      error: null,
    };
  },
};
