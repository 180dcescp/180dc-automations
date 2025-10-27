# Scripts

Automation scripts for syncing data across services and generating reports.

## Available scripts

- `slack-usergroups-sync.js` — Sync Slack usergroups from member data
- `slack-titles-sync.js` — Update Slack display names/titles
- `notion-member-sync.js` — Sync members to Notion database
- `notion-client-sync.js` — Sync client data to Notion
- `sync-team-members.js` — Aggregate member sync workflow
- `sync-clients.js` — Aggregate client sync workflow
- `weekly-analytics-report.js` — Weekly analytics summary
- `linkedin-weekly-report.js` — Weekly LinkedIn organization analytics

## Running locally

```bash
npm install
node scripts/<script-name>.js
```

Set environment variables via `.env` at the repository root when running locally.

## Required environment variables

- Google: `GOOGLE_PROJECT_ID`, `GOOGLE_PRIVATE_KEY_ID`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_CLIENT_ID`
- Notion: `NOTION_TOKEN`
- Slack: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`
- LinkedIn: `LINKEDIN_ID`, `LINKEDIN_API_KEY`, `LINKEDIN_ORG_ID`, `SLACK_CHANNEL_MARKETING`
- Optional: `GOOGLE_ANALYTICS_ID`, Sanity tokens where relevant

## LinkedIn weekly insights

The `linkedin-weekly-report.js` script:
- Runs weekly via GitHub Actions (Mondays at 9:00 AM UTC)
- Fetches LinkedIn organization analytics and post performance
- Sends formatted report to marketing Slack channel
- Uses LinkedIn Community Management API with OAuth 2.0

### Setup

1. Create a LinkedIn app at [LinkedIn Developer Portal](https://www.linkedin.com/developers/)
2. Add repository secrets:
   - `LINKEDIN_ID`: LinkedIn app Client ID
   - `LINKEDIN_API_KEY`: LinkedIn app Client Secret  
   - `LINKEDIN_ORG_ID`: Your organization's LinkedIn ID
   - `SLACK_CHANNEL_MARKETING`: Marketing channel ID (e.g., #marketing-updates)
3. Test locally:

```bash
node scripts/linkedin-weekly-report.js
```

### Troubleshooting

- Verify LinkedIn app has required permissions (r_organization_social, r_organization_admin)
- Confirm organization ID is correct (found in LinkedIn admin panel)
- Check GitHub Actions or local logs for API connection issues


