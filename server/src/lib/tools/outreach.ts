// Agent-facing: add someone to the outreach pipeline ("remind me to reach out to
// X"). Persists in the contacts table and resurfaces in the morning brief until
// acted on. Channel (email / LinkedIn / intro) gets figured out later.
import { addContact } from "../pipeline.js";
import type { Tool } from "../harness/types.js";

export const addOutreach: Tool<{ name: string; link?: string; org?: string; category?: string; note?: string }> = {
  name: "add_outreach",
  description:
    "Add a person to the user's outreach pipeline / to-do (e.g. 'remind me to reach out to X'). Stores them and resurfaces in the morning brief until handled. Use when the user wants to remember to contact someone, even if how to reach them is unknown yet.",
  parameters: {
    name: { type: "string", description: "Person's name", required: true },
    link: { type: "string", description: "A profile/link (LinkedIn, site) if given" },
    org: { type: "string", description: "Their company/org if known" },
    category: { type: "string", description: "KOL | cofounder | institution | connection" },
    note: { type: "string", description: "Why reach out / context" },
  },
  effect: "write",
  async execute({ name, link, org, category, note }) {
    const c = addContact({ name, link, org, category, note });
    return { ok: true, data: { id: c.id, name: c.name, status: c.status }, error: null };
  },
};
