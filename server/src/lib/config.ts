// Central config — reads env once. No secrets logged.
import { homedir } from "node:os";
import { join } from "node:path";

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: Number(env("PORT", "8787")),
  frontendOrigin: env("FRONTEND_ORIGIN", "http://localhost:3000"),

  // Claude subscription auth — the Agent SDK reads CLAUDE_CODE_OAUTH_TOKEN.
  oauthToken: env("CLAUDE_CODE_OAUTH_TOKEN"),
  model: env("HARNESS_MODEL", "claude-sonnet-4-6"),
  modelHeavy: env("HARNESS_MODEL_HEAVY", "claude-opus-4-8"),

  exaApiKey: env("EXA_API_KEY"),
  apifyToken: env("APIFY_TOKEN"), // email-finder via Apify actor (cold outreach)
  prospeoApiKey: env("PROSPEO_API_KEY"), // verified B2B email finder (tier-1)
  telegramBotToken: env("TELEGRAM_BOT_TOKEN"), // "Solo" contact on your phone via Telegram

  imessageDbPath: env(
    "IMESSAGE_DB_PATH",
    join(homedir(), "Library/Messages/chat.db"),
  ),
  // Your own iMessage handle(s) — phone AND/OR Apple ID email, comma-separated.
  // The bridge watches the self-chats for these so you can text Solo from your
  // phone: message yourself "solo <query>" and it replies.
  imessageSelfHandles: env("IMESSAGE_SELF_HANDLE")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  imessageBridgeTrigger: env("IMESSAGE_BRIDGE_TRIGGER", "solo"),

  // Google OAuth (Gmail + Calendar, read-only). One-time consent via
  // `npm run google-auth`. Tokens stored in data/google-tokens.json.
  googleClientId: env("GOOGLE_CLIENT_ID"),
  googleClientSecret: env("GOOGLE_CLIENT_SECRET"),
  googleRedirectPort: Number(env("GOOGLE_REDIRECT_PORT", "8788")),

  // Paths
  dataDir: join(process.cwd(), "data"),
  dbPath: join(process.cwd(), "data", "harness.db"),
  googleTokenPath: join(process.cwd(), "data", "google-tokens.json"),
  emailStylePath: join(process.cwd(), "data", "email-style.json"),
  profilePath: join(process.cwd(), "..", "profile.md"),
  // MedMorphIQ one-pager: auto-attached to outreach that mentions MedMorphIQ.
  onePagerPath: join(process.cwd(), "assets", "medmorphiq-onepager.pdf"),
} as const;

export function hasClaudeAuth(): boolean {
  return config.oauthToken.length > 0;
}

export function hasExa(): boolean {
  return config.exaApiKey.length > 0;
}

export function hasApify(): boolean {
  return config.apifyToken.length > 0;
}

export function hasProspeo(): boolean {
  return config.prospeoApiKey.length > 0;
}

export function hasGoogleClient(): boolean {
  return config.googleClientId.length > 0 && config.googleClientSecret.length > 0;
}
