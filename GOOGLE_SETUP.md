# Google setup — Gmail + Calendar (read-only)

One-time, ~5 minutes. The harness reads recent mail and your next-48h calendar to
enrich the brief. Read-only scopes; it never sends mail or creates events.

## 1. Create an OAuth client

1. Go to <https://console.cloud.google.com/> → create (or pick) a project.
2. **APIs & Services → Enable APIs**: enable **Gmail API** and **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (fine for personal use).
   - Add yourself (rishikk@utexas.edu) as a **Test user**.
   - Scopes: you can leave default; the app requests `gmail.readonly` + `calendar.readonly` at consent time.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - Copy the **Client ID** and **Client secret**.

## 2. Configure + authorize

Put the credentials in `server/.env`:

```
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
GOOGLE_REDIRECT_PORT=8788
```

Then run the one-time consent:

```bash
cd server
npm run google-auth
```

It prints a URL → open it → approve → the script captures the token and saves it to
`server/data/google-tokens.json` (gitignored). Done.

## 3. Verify

```bash
curl -s http://localhost:8787/api/health
#  → sources.gmail / sources.calendar should be "ok"
npm run brief        # the brief now includes inbox + meeting prep
```

## Notes

- Tokens auto-refresh; you only consent once.
- To revoke: delete `server/data/google-tokens.json` (and remove access at
  <https://myaccount.google.com/permissions>).
- If `read_gmail` / `read_calendar` ever fail, the harness raises a
  `SOURCE_DEGRADED` alarm and the brief still runs on the other sources.
