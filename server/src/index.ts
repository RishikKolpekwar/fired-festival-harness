// Entrypoint — load env FIRST, then start the HTTP server + 7AM scheduler.
import "./lib/env.js"; // side-effect: must run before any config read
import cron from "node-cron";
import { buildServer } from "./server.js";
import { config, hasClaudeAuth } from "./lib/config.js";
import { generateBrief, latestBrief } from "./lib/harness/brief.js";
import { localDateISO } from "./lib/todos.js";
import type { Brief } from "./lib/harness/types.js";
import { createClaudeWorker } from "./lib/agents/claudeAgent.js";
import { startImessageBridge } from "./lib/imessageBridge.js";
import { startTelegramBridge } from "./lib/telegramBridge.js";
import { installProcessGuards } from "./lib/processGuard.js";
import { runGoogleHealthCheck } from "./lib/google/health.js";

// Safety net: a stray async error must NEVER kill the harness (root-caused
// 2026-06-21 crash-loop — an unhandled agent-sdk AbortError exited the process
// every brief-gen, launchd kept restarting it → flapping). The guards keep the
// process alive AND quiet the EXPECTED, by-design abort while still logging every
// real failure at full volume. KeepAlive is the last resort, not the norm.
installProcessGuards();

const app = await buildServer();
await app.listen({ port: config.port, host: "127.0.0.1" });

console.log(`\n  Solo harness → http://localhost:${config.port}`);
console.log(`  model: ${config.model}   auth: ${hasClaudeAuth() ? "ok" : "MISSING — run `claude setup-token`"}`);
console.log(`  frontend expected at: ${config.frontendOrigin}\n`);

// Phone bridges: text Solo from your phone.
if (hasClaudeAuth()) {
  startImessageBridge(createClaudeWorker());
  startTelegramBridge(createClaudeWorker());
}

// Brief freshness is CALENDAR-DAY based, not a rolling 6h window: the brief is
// stale if the latest one wasn't generated on today's LOCAL day. This is what
// fixes "the brief shows yesterday" — the old 6h check + a 7am cron silently
// served a day-old brief whenever the Mac was asleep through 7am.
let generating = false;
// Backoff between retries when a generation comes back empty (0 items). generateBrief
// never persists an empty brief, so we retry a couple of times before giving up; the
// 30-min catch-up loop will try again later regardless.
const EMPTY_RETRY_DELAYS_MS = [60_000, 180_000];

// A brief only counts as "today's" if it was generated on today's local day AND has
// real content. An empty brief (0 items) is never valid — that's what makes the
// scheduler retry instead of treating a blank run as done.
function isValidToday(b: Brief | null): boolean {
  return !!b && b.items.length > 0 && localDateISO(new Date(b.generatedAt)) === localDateISO();
}

async function ensureTodaysBrief(reason: string): Promise<void> {
  if (!hasClaudeAuth() || generating) return;
  if (isValidToday(latestBrief())) return; // today's good brief already built
  generating = true;
  console.log(`[brief] no valid brief for today — generating (${reason})…`);
  // The brief touches Gmail/Calendar/Drive — probe first so a degraded token/API
  // alerts now (with the fix) rather than failing silently mid-generation.
  void runGoogleHealthCheck(`pre-brief:${reason}`);
  try {
    const attempts = 1 + EMPTY_RETRY_DELAYS_MS.length;
    for (let i = 0; i < attempts; i++) {
      const brief = await generateBrief({ emit: () => {}, worker: createClaudeWorker() });
      if (brief.items.length > 0) {
        console.log(`[brief] ready (${reason}).`);
        return;
      }
      const delay = EMPTY_RETRY_DELAYS_MS[i];
      if (delay === undefined) {
        console.warn(`[brief] still empty after ${attempts} attempts (${reason}) — kept the last good brief, will retry on the next catch-up.`);
        return;
      }
      console.warn(`[brief] empty generation (${reason}), attempt ${i + 1}/${attempts}; retrying in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  } catch (err) {
    console.error(`[brief] failed (${reason}):`, err);
  } finally {
    generating = false;
  }
}

// Google health: probe on startup, every 6h, and right before each brief gen so
// degradation (invalid_grant expiry / 403 SERVICE_DISABLED) alerts on Telegram
// with the exact fix BEFORE a task hits it. Alerts dedup in the settings table.
void runGoogleHealthCheck("startup");
cron.schedule("0 */6 * * *", () => void runGoogleHealthCheck("6h cron"), { timezone: "America/Chicago" });

// On launch: make sure TODAY's brief exists (covers a restart after midnight).
void ensureTodaysBrief("startup");

// Catch-up loop: every 30 min, if it's past ~6am local and today's brief still
// isn't built (e.g. the Mac slept through the 7am cron), build it on wake. Once
// today's brief exists this no-ops, so it generates at most once per day.
setInterval(() => {
  if (new Date().getHours() >= 6) void ensureTodaysBrief("catch-up");
}, 30 * 60_000);

// 7AM local: the intended fresh-at-wakeup regeneration.
cron.schedule("0 7 * * *", () => void ensureTodaysBrief("7am cron"), { timezone: "America/Chicago" });
