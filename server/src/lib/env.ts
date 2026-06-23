// Side-effect module: load .env into process.env BEFORE any module reads config.
// Import this FIRST (before ./config or anything that imports it).
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const text = readFileSync(join(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    // .env wins when it carries a real value; a non-empty real env var still wins
    // over an empty .env line. Avoids a stale empty var (e.g. an unset token at
    // first boot) sticking around and blocking the real value on later reloads.
    const existing = process.env[key];
    if (existing === undefined || existing === "" || val !== "") process.env[key] = val;
  }
} catch {
  /* no .env — rely on real env */
}
