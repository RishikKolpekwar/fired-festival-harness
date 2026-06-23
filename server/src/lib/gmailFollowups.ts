// Email follow-up adapter for the follow-ups board. Scans recent OUTREACH threads
// the user started in Gmail and maps each to a RawFollowUp with reply-state hints,
// so warm leads that live only in the inbox (e.g. Pantai Hospital's "Interested"
// reply) surface on the board. Read-only. New file — followups.ts unions it into
// ownedRawFollowUps(). Reply state is read from the Gmail SENT label, which is
// reliable: last message has SENT → we're waiting on them; otherwise they replied.
import { getAccessToken, hasGoogleAuth } from "./google/auth.js";
import type { RawFollowUp } from "./followups.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SELF = /rishikkolpekwar@gmail\.com|rishikk@utexas\.edu/i;
// Personal/freemail recipient domains → not outreach (cold outreach goes to orgs).
const FREEMAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "protonmail.com", "aol.com"]);

// Outreach the user initiated (his sent intros/partnership notes), last ~90 days.
const OUTREACH_Q =
  "from:me (medmorphiq OR oncotwin OR pathology OR ihc OR ki-67 OR biomarker OR introduction OR intro OR partnership OR collaboration OR pilot OR advisor OR cofounder OR hospital OR diagnostics OR oncology OR genomics OR demo OR meeting OR call) newer_than:90d";

interface ThreadMsg {
  id: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

function hdr(m: ThreadMsg, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseAddr(raw: string): { name?: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1]?.trim() || undefined, email: (m[2] ?? "").toLowerCase().trim() };
  return { email: raw.toLowerCase().trim() };
}

function isSent(m: ThreadMsg): boolean {
  return (m.labelIds ?? []).includes("SENT") || SELF.test(hdr(m, "From"));
}

/** Outreach threads from Gmail → follow-ups with reply-state hints (read-only). */
export async function emailFollowUps(maxThreads = 20): Promise<RawFollowUp[]> {
  if (!hasGoogleAuth()) return [];
  try {
    const token = await getAccessToken();
    const auth = { Authorization: `Bearer ${token}` };
    const listRes = await fetch(`${API}/threads?q=${encodeURIComponent(OUTREACH_Q)}&maxResults=${maxThreads}`, { headers: auth });
    if (!listRes.ok) return [];
    const { threads = [] } = (await listRes.json()) as { threads?: { id: string }[] };

    const results = await Promise.all(
      threads.map(async (th): Promise<RawFollowUp | null> => {
        const tRes = await fetch(
          `${API}/threads/${th.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: auth },
        );
        if (!tRes.ok) return null;
        const { messages = [] } = (await tRes.json()) as { messages?: ThreadMsg[] };
        if (!messages.length) return null;

        const first = messages[0]!;
        const last = messages[messages.length - 1]!;
        if (!isSent(first)) return null; // only threads the USER started (outreach)

        const to = parseAddr(hdr(first, "To"));
        if (!to.email || SELF.test(to.email)) return null;
        if (FREEMAIL.has(to.email.split("@")[1] ?? "")) return null; // skip personal/family

        const subject = hdr(first, "Subject").replace(/^re:\s*/i, "").trim() || "your note";
        const repliedByThem = !isSent(last); // last message is from the other party → they replied
        const lastTouch = last.internalDate ? new Date(Number(last.internalDate)).toISOString() : undefined;
        const who = to.name || to.email.split("@")[0]!;
        const org = to.email.split("@")[1]?.split(".")[0];

        return {
          id: `email-${th.id}`,
          who,
          org,
          channel: "email",
          pending: repliedByThem
            ? `${who} replied re "${subject}" — you owe a response`
            : `you emailed ${who} re "${subject}", no reply yet`,
          lastTouch,
          sourceRef: to.email,
          entity: `person:${who.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
          owed: repliedByThem || undefined, // they replied → you owe the next move → needs_you
          awaitingThem: repliedByThem ? undefined : true, // sent, no reply → ball in their court
          baseUrgency: repliedByThem ? 85 : 45,
          suggestedAction: repliedByThem ? `reply to ${who}` : `nudge ${who} on "${subject}"`,
        };
      }),
    );
    // One follow-up per recipient: prefer an owed (they replied) thread, then the
    // most recent — so a person with 3 separate sent threads shows once.
    const byPerson = new Map<string, RawFollowUp>();
    for (const r of results) {
      if (!r) continue;
      const key = r.sourceRef ?? r.who;
      const prev = byPerson.get(key);
      if (!prev) { byPerson.set(key, r); continue; }
      const better = (r.owed ? 1 : 0) - (prev.owed ? 1 : 0) || (r.lastTouch ?? "").localeCompare(prev.lastTouch ?? "");
      if (better > 0) byPerson.set(key, r);
    }
    return [...byPerson.values()];
  } catch {
    return [];
  }
}
