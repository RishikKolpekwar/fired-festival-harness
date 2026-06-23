// Learn the user's REAL email voice from their Sent folder, so cold-email drafts
// match how they actually write (formality, salutation, structure, sign-off) —
// not a generic guess. Cached to data/email-style.json, refreshed weekly.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { getAccessToken, hasGoogleAuth } from "./auth.js";
import type { Agent } from "../harness/types.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TTL_MS = 7 * 86_400_000;

interface StyleCache {
  guide: string;
  at: number;
}

function readCache(): StyleCache | null {
  if (!existsSync(config.emailStylePath)) return null;
  try {
    return JSON.parse(readFileSync(config.emailStylePath, "utf8")) as StyleCache;
  } catch {
    return null;
  }
}

export function getEmailStyle(): string | null {
  return readCache()?.guide ?? null;
}

// Recursively pull text/plain out of a Gmail message payload.
function extractBody(payload: unknown): string {
  const p = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) {
    return Buffer.from(p.body.data, "base64url").toString("utf8");
  }
  for (const part of p.parts ?? []) {
    const t = extractBody(part);
    if (t) return t;
  }
  return "";
}

async function fetchSentBodies(max: number): Promise<string[]> {
  const token = await getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };
  const list = (await (
    await fetch(`${API}/messages?q=${encodeURIComponent("in:sent -in:chats")}&maxResults=${max}`, { headers: auth })
  ).json()) as { messages?: { id: string }[] };
  const bodies: string[] = [];
  for (const m of list.messages ?? []) {
    const full = (await (await fetch(`${API}/messages/${m.id}?format=full`, { headers: auth })).json()) as {
      payload?: unknown;
    };
    const body = extractBody(full.payload)
      .replace(/^On .*wrote:$/gm, "")
      .replace(/^>.*$/gm, "") // strip quoted reply chains
      .trim();
    if (body.length > 200) bodies.push(body.slice(0, 1500));
  }
  return bodies;
}

/** Learn (or return cached) style guide. Cheap to call — caches for a week. */
export async function getOrLearnEmailStyle(worker: Agent): Promise<string | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.at < TTL_MS) return cached.guide;
  if (!hasGoogleAuth()) return cached?.guide ?? null;

  try {
    const bodies = await fetchSentBodies(20);
    if (bodies.length < 2) return cached?.guide ?? null;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 90_000);
    const res = await worker.run({
      runId: nanoid(8),
      system:
        "You analyze how a specific person writes emails and produce a STYLE GUIDE another writer can follow to sound exactly like them, especially for cold / outreach emails. Capture: salutation pattern, level of formality, capitalization, typical greeting and sign-off, sentence length and structure, how they introduce themselves, and any characteristic phrasings. Be concrete with examples drawn from the samples. 8-12 short bullet points. Do not use hyphens or dashes.",
      prompt: `Here are emails this person has SENT. Produce their style guide.\n\n${bodies.map((b, i) => `--- EMAIL ${i + 1} ---\n${b}`).join("\n\n")}`,
      history: [],
      toolSpecs: [],
      callTool: async () => ({ ok: false, data: null, error: "no tools" }),
      emit: () => {},
      signal: ac.signal,
      model: config.modelHeavy,
      maxTurns: 1,
    });
    clearTimeout(timer);
    const guide = res.text.trim();
    if (guide) writeFileSync(config.emailStylePath, JSON.stringify({ guide, at: Date.now() }, null, 2));
    return guide;
  } catch {
    return cached?.guide ?? null;
  }
}
