# Scripts

Automation scripts for syncing data across services and generating reports.

## Available scripts

- `slack-usergroups-sync.js` — Sync Slack usergroups from member data
- `slack-titles-sync.js` — Update Slack display names/titles
- `notion-member-sync.js` — Sync members to Notion database
- `notion-client-sync.js` — Sync client data to Notion
- `sync-team-members.js` — Aggregate member sync workflow
- `sync-clients.js` — Aggregate client sync workflow
- `sync-drive-transcripts.js` — Sync Google Drive transcripts to Notion
- `weekly-analytics-report.js` — Weekly analytics summary

## Running locally

```bash
npm install
node scripts/<script-name>.js
```

Set environment variables via `.env` at the repository root when running locally.

## Required environment variables

- Google: `GOOGLE_PROJECT_ID`, `GOOGLE_PRIVATE_KEY_ID`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_CLIENT_ID`
- Notion: `NOTION_TOKEN`, `MEETING_DATABASE_ID`
- Slack: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`
- Optional: `GOOGLE_ANALYTICS_ID`, Sanity tokens where relevant

## Drive transcript sync

The `sync-drive-transcripts.js` script:
- Runs weekly (typical schedule)
- Monitors the Drive folder ID `1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`
- Processes `.txt`, `.doc`, `.docx`, `.pdf` files
- Creates Notion pages and sends Slack notifications
- Avoids duplicates by tracking processed files

### Setup

1. Add repository secret `GOOGLE_DRIVE_FOLDER_ID=1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`
2. Share the Drive folder with your service account (Viewer)
3. Test locally:

```bash
node scripts/sync-drive-transcripts.js
```

### Troubleshooting

- Verify service account access to the folder
- Confirm Notion and Slack tokens
- Check GitHub Actions or local logs for the "Verify required secrets" step


