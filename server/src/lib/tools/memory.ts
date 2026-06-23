// Agent-facing memory + contact-lookup tools.
//  - remember / recall: general facts the user states ("my dad works at Dell").
//  - lookup_contact: read a person's card (org, job title, emails, phones) from
//    macOS Contacts — answers "where does X work" when the card has it.
import { remember, recall } from "../memory.js";
import { lookupContacts } from "../contacts.js";
import type { Tool } from "../harness/types.js";

export const rememberTool: Tool<{ fact: string; subject?: string }> = {
  name: "remember",
  description:
    "Store a fact the user tells you to remember about their life or people in it (e.g. 'my dad works at Dell', 'I'm allergic to penicillin', 'my sister's name is Maya'). Use whenever the user shares a durable personal fact or says 'remember that...'. It persists and you can recall it later. You CAN remember things; never say you have no memory.",
  parameters: {
    fact: { type: "string", description: "The full fact to store, in plain language", required: true },
    subject: { type: "string", description: "Optional who/what it's about (e.g. 'dad', 'me', 'sister') for easy recall" },
  },
  effect: "write",
  async execute({ fact, subject }) {
    const f = remember(fact, subject);
    return { ok: true, data: { id: f.id, subject: f.subject }, error: null, modelText: `got it, i'll remember that${f.subject ? ` about ${f.subject}` : ""}.` };
  },
};

export const recallTool: Tool<{ query?: string }> = {
  name: "recall",
  description:
    "Recall facts the user previously asked you to remember. Pass a `query` (e.g. 'dad', 'allergies') to filter, or leave empty for everything. ALWAYS call this before saying you don't know something personal the user might have told you.",
  parameters: {
    query: { type: "string", description: "Subject or keyword to look up (e.g. 'dad'). Omit to list all." },
  },
  effect: "read",
  async execute({ query }) {
    const facts = recall(query);
    return {
      ok: true,
      data: { count: facts.length, facts },
      error: null,
      modelText: facts.length ? facts.map((f) => `- ${f.fact}`).join("\n") : `nothing stored${query ? ` about "${query}"` : ""} yet.`,
    };
  },
};

export const lookupContactTool: Tool<{ name: string }> = {
  name: "lookup_contact",
  description:
    "Look up a person's contact card from the user's macOS Contacts by name (e.g. 'dad', 'Andrew Beck'). Returns their company (org), job title, emails, and phone numbers when present on the card. Use to answer 'where does X work', 'what's X's email/number', or to get an org domain for outreach. If the card has no company, say so plainly — do not guess.",
  parameters: {
    name: { type: "string", description: "The contact's name or label (e.g. 'dad', 'mom', a full name)", required: true },
  },
  effect: "read",
  async execute({ name }) {
    const cards = lookupContacts(name);
    if (!cards.length) return { ok: true, data: { count: 0 }, error: null, modelText: `no contact found matching "${name}".` };
    const lines = cards.slice(0, 5).map((c) => {
      const bits = [c.org ? `works at ${c.org}` : null, c.jobTitle ? `(${c.jobTitle})` : null, c.emails[0] ? `email: ${c.emails[0]}` : null, c.phones[0] ? `phone: ${c.phones[0]}` : null].filter(Boolean);
      return `- ${c.name}: ${bits.length ? bits.join(", ") : "no company or details on the card"}`;
    });
    return { ok: true, data: { count: cards.length, cards }, error: null, modelText: lines.join("\n") };
  },
};
