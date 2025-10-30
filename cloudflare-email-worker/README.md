# Cloudflare Email Worker: Shared Mailbox Forward & Auto-Reply

## Features
- Watches multiple Google Workspace inboxes (Gmail API)
- Forwards human-written emails to executive list (from GSheet)
- Sends instant customizable auto-reply
- Skip computer-generated/bot messages

## Environment Variables Required (wrangler.toml + CF Dashboard)
- **GMAIL_CLIENT_EMAIL**
- **GMAIL_PRIVATE_KEY**
- **GMAIL_USER** (= comma-separated list of email addresses to monitor)
- **GSHEET_PROJECT_ID**
- **GSHEET_CLIENT_EMAIL**
- **GSHEET_PRIVATE_KEY**
- **GSHEET_SHEET_ID**
- **GSHEET_EMAIL_RANGE** (e.g. Execs!A:Z)

## Endpoints
- `POST /process-email` — triggers inbox scan, forwarding and auto-reply for all configured mailboxes (add CRON in CF 💡)
- `GET /` — health/status simple endpoint

## Configurable Files
- `auto_reply_template.txt` — reply body shown to senders

## Setup/Deploy
1. Add env vars in wrangler.toml **and** Cloudflare dashboard (see above)
2. `npx wrangler deploy`
3. (Schedule as CRON if desired)

## Notes
- Forwards and replies currently use plain RFC822 (not rich HTML)
- GSheet format must include an 'email' header
- Code uses Google Service Account (or delegated domain-wide auth)

---
MIT, 2025
