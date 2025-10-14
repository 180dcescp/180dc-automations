# Team Member & Client Sync Automation

This automation system syncs team member data from Slack profiles and client data from Google Sheets to Sanity CMS automatically.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd automation
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

```env
# Sanity Configuration
SANITY_PROJECT_ID=ca89c0zm
SANITY_DATASET=production
SANITY_TOKEN=your_sanity_token_here

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_CHANNEL=#team-updates

# Google Sheets Configuration
GOOGLE_SHEETS_ID=your_google_sheets_id_here
GOOGLE_SHEETS_RANGE=Sheet1!A:D
GOOGLE_PROJECT_ID=your_google_project_id
GOOGLE_PRIVATE_KEY_ID=your_private_key_id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your_client_id
```

### 3. Set Up Sanity API Token

1. Go to your Sanity project dashboard
2. Navigate to "API" → "Tokens"
3. Create a new token with "Editor" permissions
4. Copy the token to your `.env` file

### 4. Set Up Slack Bot

1. Go to [api.slack.com](https://api.slack.com/apps)
2. Create a new app
3. Go to "OAuth & Permissions"
4. Add these scopes:
   - `users:read` (to read team member profiles)
   - `chat:write` (optional, for notifications)
5. Install the app to your workspace
6. Copy the "Bot User OAuth Token" to your `.env` file

### 5. Set Up Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Sheets API
4. Create a service account:
   - Go to "IAM & Admin" → "Service Accounts"
   - Click "Create Service Account"
   - Fill in the details and create
5. Generate a JSON key for the service account
6. Share your Google Sheet with the service account email
7. Copy the credentials to your `.env` file

## 📊 Slack Profile Format

The system automatically reads from Slack user profiles. Team members should have:

- **Name**: Set in their Slack profile
- **Email**: Set in their Slack profile  
- **Profile Picture**: Set in their Slack profile
- **Title**: Set in their Slack profile with format: `Position - Department (optional details)`

**Title Format Examples:**
- `Associate Director - Consulting (CASIE, FEBA, Solidar, Stealth Startup, CMT, CASA)`
- `President` → Automatically assigns "Presidency" as department
- `Vice-President` → Automatically assigns "Presidency" as department
- `Head of - Marketing`
- `Senior Consultant - Consulting`
- `Alumni (Project 1, Project 2)` → **Excluded from CMS**

**Edge Cases Handled:**
- **President/Vice-President**: No department in title → Automatically uses "Presidency"
- **Alumni members**: Any title containing "Alumni" → Completely excluded from CMS
- **Default avatars**: Profile images with >70% single color coverage → Excluded from Sanity (uses default avatar instead)
- **Brackets**: Everything in brackets is ignored (e.g., project names, additional info)

The system automatically:
- Extracts position from the part before " - "
- Extracts department from the part after " - " 
- Ignores everything in brackets
- Assigns "Presidency" department to President/Vice-President
- Excludes all alumni members

## 🛠️ Usage

### Run Sync

```bash
npm run sync           # Team members from Slack → Sanity
npm run sync-clients   # Clients from Google Sheets → Sanity
```

## 📊 Google Sheets Format

The system automatically reads from Google Sheets. Your sheet should have columns:
- **Column A**: Client Name (required)
- **Column B**: Website (required) 
- **Column C**: GTM Vertical (required)
- **Column D**: Client logo (Google Drive link, required)
- **Column E**: Country (optional)
- **Column F**: Project Type (optional)

**Logo URL Format:**
- Google Drive sharing links are automatically converted to accessible URLs
- Supports formats like: `https://drive.google.com/file/d/FILE_ID/view`
- Only clients with all 4 required fields filled will be synced
- Country and Project Type are stored but not displayed on the website

## 📋 Available Commands

- `npm run sync` - Run the team member sync process
- `npm run sync-clients` - Run the client sync process

## 🔄 Automation Options

### Manual Sync
Run the sync commands whenever you want to update data:
- `npm run sync` - Update team members from Slack
- `npm run sync-clients` - Update clients from Google Sheets

### Automated Sync
GitHub Actions workflows are included:
- **Team Sync**: Runs daily to sync team members from Slack
- **Client Sync**: Runs daily to sync clients from Google Sheets

### Scheduled Sync
Set up a cron job to run automatically:

```bash
# Run team sync every day at 9 AM
0 9 * * * cd /path/to/automation && npm run sync

# Run client sync every day at 10 AM  
0 10 * * * cd /path/to/automation && npm run sync-clients
```

### Webhook Integration
Read.ai webhooks create Notion meeting pages and send Slack notifications. Deploy either the Node server (`automation/webhook-server.js`) or the Cloudflare Worker (`automation/worker.js`).

## 📱 Slack Notifications

The system sends notifications for:
- ✅ Sync completion with summary
- 🎉 New team members added
- 🔄 Team member updates
- 🗑️ Team member removals
- ❌ Errors and warnings

## 🛡️ Error Handling

The system includes comprehensive error handling:
- Connection failures are logged and reported
- Individual member sync errors don't stop the entire process
- All errors are reported to Slack
- Detailed logging for troubleshooting

## 🔧 Troubleshooting

### Common Issues

1. **Google Sheets Access Denied**
   - Ensure the service account email has access to the spreadsheet
   - Check that the spreadsheet ID is correct

2. **Sanity Permission Denied**
   - Verify your token has write permissions
   - Check that the project ID and dataset are correct

3. **Slack Message Failed**
   - Ensure the bot is invited to the channel
   - Check that the channel name includes the # symbol
   - Verify the bot token is correct

4. **Image Upload Failed**
   - Check that image URLs are accessible
   - Ensure images are in supported formats (JPG, PNG, etc.)

5. **Color Analysis Issues**
   - The system now analyzes profile images to detect default avatars
   - If one color covers more than 70% of an image, it's considered a default avatar
   - This helps prevent uploading generic/default profile pictures to Sanity

### Notes
- Color analysis for avatars is automatic; no manual test command is provided in production.

### Debug Mode

Add `DEBUG=true` to your `.env` file for more detailed logging.

## 📈 Monitoring

Monitor your syncs by:
- Checking Slack notifications
- Reviewing console logs
- Monitoring Sanity Studio for changes
- Setting up alerts for failed syncs

## 🔒 Security

- Store credentials securely
- Use environment variables for sensitive data
- Regularly rotate API tokens
- Monitor API usage to stay within limits

## 📚 API Limits

### Sanity Free Plan
- ✅ 10,000 documents
- ✅ 2,000 unique attributes
- ✅ 2 webhooks
- ✅ Full API access

### Google Sheets API
- 100 requests per 100 seconds per user
- 1,000 requests per 100 seconds

### Slack API
- Tier 1: 1+ per minute
- Tier 2: 20+ per minute
- Tier 3: 50+ per minute
- Tier 4: 100+ per minute

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the error logs
3. Test individual connections
4. Verify your data format matches expectations
