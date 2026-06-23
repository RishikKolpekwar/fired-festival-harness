# Google auth — the one-time fix so it never breaks again

You should only ever have to do this **once**. It kills both recurring failures:

1. **Token dies every ~2 days** (`invalid_grant` → you re-run `npm run google-auth`) — caused by the OAuth app being in **Testing** mode. Fix = publish it to **production**.
2. **Drive 403 "API not enabled" mid-task** — caused by the Drive/Gmail/Calendar APIs not being turned on in the project. Fix = enable the three APIs.

Everything below is for **GCP project `878601266193`** (the OAuth client is `878601266193-...apps.googleusercontent.com`). All links are pre-pointed at that project — just click. Whole thing is ~5 minutes.

> Sign in to the console as the Google account that **owns** this project / that you authorize the harness with (your personal gmail). Same account throughout.

---

## Part A — Publish the OAuth app (stops the token from expiring)

**Why this is the root cause:** Google revokes refresh tokens after **7 days** when the OAuth app's publishing status is **Testing** *and* the user type is **External** *and* it requests sensitive scopes — which is exactly our case (we request `gmail.send`, `gmail.compose`, `gmail.readonly`, `calendar.readonly`, `drive`). Moving the app to **In production** stops the 7-day expiry. Production refresh tokens **do not expire** for an unverified personal app — you just click through the "unverified app" warning once at consent. (Verified against Google's docs — see Sources.)

### Steps

1. Open the audience screen (this is where "OAuth consent screen / Publishing status" now lives — Google renamed it to **Google Auth Platform → Audience**):

   **https://console.cloud.google.com/auth/audience?project=878601266193**

2. Confirm at the top: **User type = External**, **Publishing status = Testing**.

3. Under **Publishing status**, click **PUBLISH APP**.

4. A dialog says "Push to production?" / lists the scopes. Click **Confirm**.

5. Publishing status should now read **In production**. Done — no verification submission needed (see note below).

### What about the "Google verification" prompt?

- Because we use **sensitive Gmail scopes + External user type**, the console may show a banner offering to "**Prepare for verification**" or "Submit for verification." **You do NOT need to submit it.** Full Google verification (the multi-week brand/security review) is only required to let the **general public** use the app.
- For a **single personal user (you, the project owner)**, unverified-production works fine forever. At the next `npm run google-auth` consent screen you'll see "Google hasn't verified this app" → click **Advanced** → **Go to <app> (unsafe)** → continue. That one click is the entire cost of staying unverified. The refresh token you get is permanent.
- **Internal user type** (which skips the warning entirely) is **not an option here** — it requires a Google Workspace org, and this project uses a personal gmail account. So: stay External, stay unverified-production, click through the warning once.

> One caveat that still applies even in production: a refresh token **unused for 6 consecutive months** is auto-invalidated. The harness uses it daily, so this will never trigger.

---

## Part B — Enable the three APIs (stops the 403 "API not enabled")

The harness calls Gmail, Calendar, and Drive. Each must be **enabled** in the project or you get `403 SERVICE_DISABLED`. The recent Drive 403 was simply Drive not being on. Click each link, click **ENABLE** (if it already says "Manage" / "API Enabled", it's already on — skip it).

1. **Gmail API** → **https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=878601266193** → **ENABLE**
2. **Google Drive API** → **https://console.cloud.google.com/apis/library/drive.googleapis.com?project=878601266193** → **ENABLE**
3. **Google Calendar API** → **https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=878601266193** → **ENABLE**

*(Optional CLI equivalent if you have `gcloud` set up: `gcloud config set project 878601266193 && gcloud services enable gmail.googleapis.com drive.googleapis.com calendar-json.googleapis.com`.)*

Enabling can take a minute to propagate. If a call still 403s right after, wait ~60s and retry.

---

## Part C — Confirm it worked

1. From `server/`, run one final consent so you get a fresh **production** refresh token:

   ```bash
   npm run google-auth
   ```

   - Sign in as the same account → click through the **"Google hasn't verified this app" → Advanced → Go to <app> (unsafe)** warning → **Allow** all requested scopes.
   - This writes the new refresh token to `data/google-tokens.json`.

2. **Verify the token is now durable**, not testing-mode. Two checks:
   - The harness's Google health-check (added by the backend lane) should report Gmail/Drive/Calendar all OK on next boot, with no `invalid_grant` alert to your phone.
   - As a manual smoke test, trigger anything that touches Gmail/Drive (e.g. a draft + one-pager attach). It should attach the local one-pager and send with no 403 and no auth error.

3. **The real proof is time:** with the app In production, the token survives past the old ~2-day / 7-day cliff. If you ever see `invalid_grant` again after this, it's *not* the testing-mode expiry — re-check Part A actually shows **In production**.

---

## TL;DR checklist

- [ ] https://console.cloud.google.com/auth/audience?project=878601266193 → **PUBLISH APP** → status reads **In production**
- [ ] Enable **Gmail API** (link above) → ENABLE
- [ ] Enable **Drive API** (link above) → ENABLE
- [ ] Enable **Calendar API** (link above) → ENABLE
- [ ] `cd server && npm run google-auth` → click through unverified warning → Allow
- [ ] No more `invalid_grant` re-auths; no more Drive 403

---

### Sources (verified, not guessed)

- Google — *Using OAuth 2.0 to Access Google APIs* (testing-mode refresh tokens expire in 7 days for External apps with sensitive scopes; the name/email/profile-only exception): https://developers.google.com/identity/protocols/oauth2
- Google Cloud — *Manage App Audience* (Publishing status, **Publish app** button, `In production`, audience at `/auth/audience`): https://support.google.com/cloud/answer/15549945
- Google — *Enable and disable APIs* (APIs & Services → Library → Enable): https://support.google.com/googleapi/answer/6158841
- The 7-day testing-token behavior (corroborating reports): https://forums.homeseer.com/forum/internet-or-network-related-plug-ins/internet-or-network-discussion/ak-google-calendar-alexbk66/1545936-refresh-token-expires-in-7-days-if-oauth-consent-screen-publishing-status-is-testing
