// Loads the user profile (the relevance lens). Editable any time at /profile.md.
import { readFileSync } from "node:fs";
import { config } from "./config.js";

let cached: { text: string; at: number } | null = null;
const TTL_MS = 30_000;

const FALLBACK = `Sophomore CS/Math at UT Austin. AI SWE intern at Intel (custom ASIC, multi-agent LLM framework for DV engineers). Founder of MedMorphIQ (AI pathology, clinically deployed). Interests: AI infrastructure, VC/startup news (20VC), pathology AI, quant finance. Voice: casual, direct, lowercase for informal, no hyphens, leads with own work.`;

export function loadProfile(): string {
  const fresh = cached && Date.now() - cached.at < TTL_MS;
  if (fresh) return cached!.text;
  try {
    const text = readFileSync(config.profilePath, "utf8");
    cached = { text, at: Date.now() };
    return text;
  } catch {
    cached = { text: FALLBACK, at: Date.now() };
    return FALLBACK;
  }
}
