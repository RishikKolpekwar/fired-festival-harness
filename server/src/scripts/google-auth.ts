// One-time Google consent. Run: npm run google-auth
// Opens a consent URL, captures the code on a localhost redirect, stores the
// refresh token in data/google-tokens.json. Read-only Gmail + Calendar scopes.
import "../lib/env.js";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { config, hasGoogleClient } from "../lib/config.js";
import { GOOGLE_SCOPES, makeOAuthClient, redirectUri, saveTokens } from "../lib/google/auth.js";

if (!hasGoogleClient()) {
  console.error(
    "\n  Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in server/.env.\n" +
      "  Create an OAuth client (Desktop app) — see GOOGLE_SETUP.md — then re-run.\n",
  );
  process.exit(1);
}

mkdirSync(config.dataDir, { recursive: true });
const client = makeOAuthClient();
const authUrl = client.generateAuthUrl({
  access_type: "offline", // get a refresh_token
  prompt: "consent",
  scope: GOOGLE_SCOPES,
});

console.log("\n  Open this URL to authorize Gmail + Calendar (read-only):\n");
console.log("  " + authUrl + "\n");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(404).end();
    return;
  }
  const url = new URL(req.url, redirectUri());
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Missing code");
    return;
  }
  try {
    const { tokens } = await client.getToken(code);
    saveTokens({
      refresh_token: tokens.refresh_token ?? undefined,
      access_token: tokens.access_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    });
    res.writeHead(200, { "Content-Type": "text/html" }).end(
      "<h2>Solo harness: Google connected ✓</h2><p>You can close this tab.</p>",
    );
    console.log("\n  ✓ Authorized. Tokens saved to data/google-tokens.json\n");
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500).end("Token exchange failed: " + String(err));
    console.error("  ✗ Token exchange failed:", err);
    server.close();
    process.exit(1);
  }
});

server.listen(config.googleRedirectPort, () => {
  console.log(`  Waiting for consent on ${redirectUri()} …\n`);
});
