// Proactive Google-integration health check. The two recurring failures — the
// refresh token dying every ~2 days (`invalid_grant`, OAuth app in Testing mode)
// and Drive/Gmail/Calendar `403 SERVICE_DISABLED` (API not enabled) — used to
// surface only mid-task. This probes cheaply on a schedule and pushes ONE crisp
// Telegram alert with the exact fix BEFORE a real task hits the wall.
// Read-only: a Gmail profile GET (token refresh happens inside getAccessToken).
import { config } from "../config.js";
import { getSetting, setSetting } from "../settings.js";
import { getAccessToken, hasGoogleAuth } from "./auth.js";

const GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const PROJECT = "878601266193";
const DOC = "server/docs/google-auth-production.md";

export type HealthKind = "healthy" | "unauthed" | "token_expired" | "api_disabled" | "unknown";

export interface HealthResult {
  ok: boolean;
  kind: HealthKind;
  detail: string;
}

// Pure classifier — given an error string (or HTTP body), decide which failure
// mode it is. Split out from the network call so it's unit-testable in isolation
// (mirrors processGuard's isExpectedAbort). `name` is the API surface for a
// SERVICE_DISABLED 403 (e.g. "gmail", "drive") if we can tell.
export function classifyGoogleError(raw: string): { kind: HealthKind; api?: string } {
  const s = raw.toLowerCase();
  // Dead/expired refresh token: the testing-mode 7-day cliff.
  if (s.includes("invalid_grant") || s.includes("token has been expired or revoked") || s.includes("not authorized")) {
    return { kind: "token_expired" };
  }
  // API not enabled in the project → 403 SERVICE_DISABLED.
  if (s.includes("service_disabled") || s.includes("accessnotconfigured") || s.includes("has not been used in project") || s.includes("api is not enabled")) {
    let api: string | undefined;
    if (s.includes("gmail")) api = "gmail";
    else if (s.includes("drive")) api = "drive";
    else if (s.includes("calendar")) api = "calendar";
    return { kind: "api_disabled", api };
  }
  return { kind: "unknown" };
}

// Console library link for the API that 403'd, pre-pointed at our project.
function libraryLink(api?: string): string {
  const slug =
    api === "drive" ? "drive.googleapis.com" :
    api === "calendar" ? "calendar-json.googleapis.com" :
    "gmail.googleapis.com";
  return `https://console.cloud.google.com/apis/library/${slug}?project=${PROJECT}`;
}

// The crisp, actionable alert text for a bad state.
export function alertMessage(result: HealthResult, api?: string): string {
  if (result.kind === "token_expired") {
    return `Google token expired. Permanent fix: publish the OAuth app to production at https://console.cloud.google.com/auth/audience?project=${PROJECT} (PUBLISH APP), then run \`cd server && npm run google-auth\`. See ${DOC}.`;
  }
  if (result.kind === "api_disabled") {
    const name = api ? `${api[0]!.toUpperCase()}${api.slice(1)} API` : "A Google API";
    return `${name} is disabled (403 SERVICE_DISABLED). Enable it: ${libraryLink(api)}, then retry. See ${DOC}.`;
  }
  if (result.kind === "unauthed") {
    return `Google is not authed. Run \`cd server && npm run google-auth\`. See ${DOC}.`;
  }
  return `Google health check failed (${result.kind}): ${result.detail}. See ${DOC}.`;
}

/** Cheap read-only probe: refresh the token + GET the Gmail profile. */
export async function checkGoogleHealth(): Promise<HealthResult> {
  if (!hasGoogleAuth()) {
    return { ok: false, kind: "unauthed", detail: "no refresh token (run npm run google-auth)" };
  }
  try {
    // getAccessToken refreshes via the refresh_token — this is where invalid_grant surfaces.
    const token = await getAccessToken();
    const res = await fetch(GMAIL_PROFILE, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true, kind: "healthy", detail: "gmail profile reachable" };
    const body = await res.text().catch(() => "");
    const { kind, api } = classifyGoogleError(body);
    return { ok: false, kind, detail: api ? `${api}: ${body.slice(0, 200)}` : body.slice(0, 200) || `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { kind } = classifyGoogleError(msg);
    return { ok: false, kind, detail: msg.slice(0, 200) };
  }
}

// Send via the SAME Telegram config the bridge uses (bot token + locked owner
// chat). No duplicated config. No-ops quietly if Telegram isn't set up.
async function sendTelegramAlert(text: string): Promise<void> {
  const token = config.telegramBotToken;
  const chatId = getSetting("telegram_owner_chat", "");
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(chatId), text, disable_web_page_preview: true }),
  }).catch(() => {});
}

const ALERT_STATE_KEY = "google_health_alert"; // stored as `${kind}:${lastSentMs}`
const REALERT_MS = 6 * 3_600_000; // re-alert at most once per 6h while still bad

// Run a check and alert on TRANSITION into a bad state (or once per ~6h while it
// stays bad). Dedup state persists in `settings` (same db-backed pattern as
// telegram_owner_chat / telegram_offset), so it survives restarts.
export async function runGoogleHealthCheck(reason: string): Promise<HealthResult> {
  const result = await checkGoogleHealth();
  const [prevKind, prevAtRaw] = getSetting(ALERT_STATE_KEY, ":").split(":");
  const prevAt = Number(prevAtRaw) || 0;

  if (result.ok) {
    if (prevKind && prevKind !== "healthy") {
      console.log(`[google-health] recovered (${reason}) — was ${prevKind}, now healthy.`);
      await sendTelegramAlert("Google integration recovered — back to healthy.");
    }
    setSetting(ALERT_STATE_KEY, `healthy:${Date.now()}`);
    return result;
  }

  const api = result.detail.startsWith("drive") ? "drive" : result.detail.startsWith("calendar") ? "calendar" : result.detail.startsWith("gmail") ? "gmail" : undefined;
  const isTransition = prevKind !== result.kind;
  const stale = Date.now() - prevAt > REALERT_MS;
  console.warn(`[google-health] ${result.kind} (${reason}): ${result.detail}`);
  if (isTransition || stale) {
    await sendTelegramAlert(alertMessage(result, api));
    setSetting(ALERT_STATE_KEY, `${result.kind}:${Date.now()}`);
  }
  return result;
}
