// Google OAuth (read-only Gmail + Calendar). Installed-app flow: one-time consent
// via `npm run google-auth`, refresh token persisted to data/google-tokens.json.
// getAccessToken() transparently refreshes. All read-only scopes.
import { OAuth2Client } from "google-auth-library";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config, hasGoogleClient } from "../config.js";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose", // create drafts
  "https://www.googleapis.com/auth/gmail.send", // send (Solo-confirm path)
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive", // find files by name + set sharing (share a doc with someone)
];

export function redirectUri(): string {
  return `http://localhost:${config.googleRedirectPort}/oauth2callback`;
}

export function makeOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: redirectUri(),
  });
}

interface StoredTokens {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
}

export function saveTokens(tokens: StoredTokens): void {
  // Merge — Google only returns refresh_token on first consent.
  const existing = loadTokens() ?? {};
  writeFileSync(config.googleTokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
}

export function loadTokens(): StoredTokens | null {
  if (!existsSync(config.googleTokenPath)) return null;
  try {
    return JSON.parse(readFileSync(config.googleTokenPath, "utf8")) as StoredTokens;
  } catch {
    return null;
  }
}

export function hasGoogleAuth(): boolean {
  return hasGoogleClient() && !!loadTokens()?.refresh_token;
}

/** Returns a valid access token, refreshing if needed. Throws if not authorized. */
export async function getAccessToken(): Promise<string> {
  if (!hasGoogleClient()) throw new Error("Google client not configured (GOOGLE_CLIENT_ID/SECRET).");
  const tokens = loadTokens();
  if (!tokens?.refresh_token) throw new Error("Not authorized — run `npm run google-auth`.");

  const client = makeOAuthClient();
  client.setCredentials({ refresh_token: tokens.refresh_token, access_token: tokens.access_token, expiry_date: tokens.expiry_date });

  // Refresh if missing or within 60s of expiry.
  const stale = !tokens.access_token || !tokens.expiry_date || tokens.expiry_date - Date.now() < 60_000;
  if (stale) {
    const { token } = await client.getAccessToken(); // library refreshes via refresh_token
    const creds = client.credentials;
    saveTokens({ access_token: creds.access_token ?? token ?? undefined, expiry_date: creds.expiry_date ?? undefined });
    if (!token) throw new Error("Failed to obtain Google access token.");
    return token;
  }
  return tokens.access_token!;
}
