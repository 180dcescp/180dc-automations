# Google Apps Script to GitHub Actions Migration

This document outlines the migration of Google Apps Script automations to GitHub Actions, preserving all functionality while improving reliability and maintainability.

## 🚀 Migrated Automations

### 1. Slack Usergroups Sync
- **Original**: Google Apps Script with manual triggers
- **New**: GitHub Actions workflow with scheduled runs
- **File**: `slack-usergroups-sync.js`
- **Workflow**: `.github/workflows/slack-usergroups-sync.yml`
- **Schedule**: Daily at 2 AM UTC
- **Features**:
  - Auto-managed project usergroups from Projects column
  - Auto-managed campus usergroups from Campus column
  - Fixed department and role-based groups
  - Alumni handling (only in @alumni group)
  - Rate limiting and batched operations

### 2. Slack Titles Sync
- **Original**: Google Apps Script with manual triggers
- **New**: GitHub Actions workflow with scheduled runs
- **File**: `slack-titles-sync.js`
- **Workflow**: `.github/workflows/slack-titles-sync.yml`
- **Schedule**: Daily at 3 AM UTC
- **Features**:
  - Only-if-different updates (checks current titles first)
  - Projects suffix support
  - Alumni handling
  - Rate limiting and batching
  - Email notifications for missing positions

### 3. Notion Member Database Sync
- **Original**: Google Apps Script with manual triggers
- **New**: GitHub Actions workflow with scheduled runs
- **File**: `notion-member-sync.js`
- **Workflow**: `.github/workflows/notion-member-sync.yml`
- **Schedule**: Daily at 4 AM UTC
- **Features**:
  - Incremental sync (updates existing, creates new, archives missing)
  - Slack profile picture integration
  - Phone number cleaning
  - Project handling
  - Status filtering (only Active members)


## 🔧 Required Repository Secrets

The following secrets must be configured in your GitHub repository:

### Google Services
- `GOOGLE_SHEETS_ID` - Google Sheets document ID
- `GOOGLE_PROJECT_ID` - Google Cloud Project ID
- `GOOGLE_CLIENT_EMAIL` - Service account email
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_PRIVATE_KEY` - Service account private key
- `GOOGLE_PRIVATE_KEY_ID` - Private key ID
- `GOOGLE_DRIVE_FOLDER_ID` - Google Drive folder ID (if needed)

### Slack
- `SLACK_BOT_TOKEN` - Slack bot token (xoxb-...)
- `SLACK_CHANNEL` - Default Slack channel for notifications

### Notion
- `NOTION_TOKEN` - Notion integration token
- `MEETING_DATABASE_ID` - Notion database ID for member sync


### Sanity (existing)
- `SANITY_AUTH_TOKEN` - Sanity authentication token
- `SANITY_DATASET` - Sanity dataset name
- `SANITY_PROJECT_ID` - Sanity project ID
- `SANITY_TOKEN` - Sanity API token

### Analytics (existing)
- `GOOGLE_ANALYTICS_ID` - Google Analytics property ID

### Cloudflare (existing)
- `CF_PAGES_BUILD_HOOK_URL` - Cloudflare Pages build hook URL

## 📋 Setup Instructions

### 1. Install Dependencies
```bash
cd automation
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the automation directory with all required secrets:
```bash
# Google Services
GOOGLE_SHEETS_ID=your_sheets_id
GOOGLE_PROJECT_ID=your_project_id
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PRIVATE_KEY_ID=your_private_key_id

# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL=#team-updates

# Notion
NOTION_TOKEN=your_notion_token
MEETING_DATABASE_ID=your_database_id


# Sanity (existing)
SANITY_AUTH_TOKEN=your_sanity_auth_token
SANITY_DATASET=your_dataset
SANITY_PROJECT_ID=your_project_id
SANITY_TOKEN=your_sanity_token

# Analytics (existing)
GOOGLE_ANALYTICS_ID=your_analytics_id

# Cloudflare (existing)
CF_PAGES_BUILD_HOOK_URL=your_build_hook_url
```

### 3. Test Individual Scripts
```bash
# Test Slack usergroups sync
npm run slack-usergroups

# Test Slack titles sync
npm run slack-titles

# Test Notion member sync
npm run notion-members

```

### 4. Enable GitHub Actions
The workflows are automatically enabled when pushed to the repository. You can also manually trigger them from the GitHub Actions tab.

## 🔄 Migration Benefits

### Reliability
- **Scheduled Execution**: No more manual triggers or missed runs
- **Error Handling**: Comprehensive error handling and retry logic
- **Logging**: Detailed logs for debugging and monitoring
- **Notifications**: Automatic failure notifications

### Maintainability
- **Version Control**: All code is version controlled
- **Code Review**: Changes can be reviewed before deployment
- **Rollback**: Easy rollback to previous versions
- **Documentation**: Comprehensive documentation and comments

### Scalability
- **Resource Management**: GitHub Actions provide more resources
- **Parallel Execution**: Multiple workflows can run simultaneously
- **Rate Limiting**: Built-in rate limiting and retry mechanisms
- **Monitoring**: Built-in monitoring and alerting

### Security
- **Secret Management**: Secure secret storage in GitHub
- **Access Control**: Fine-grained access control
- **Audit Trail**: Complete audit trail of all executions
- **Compliance**: Better compliance with security policies

## 🚨 Important Notes

### Google Apps Script Deprecation
- The original Google Apps Script automations should be **disabled** after successful migration
- Remove all triggers from the Google Apps Script editor
- Archive or delete the old scripts to avoid confusion

### Data Consistency
- All automations maintain the same data processing logic
- Column mappings are preserved exactly as in the original scripts
- Status filtering and business rules remain unchanged

### Error Handling
- Each script includes comprehensive error handling
- Failed operations are logged with detailed error messages
- Retry logic is implemented for transient failures
- Rate limiting is respected for all API calls

### Monitoring
- GitHub Actions provides built-in monitoring
- Workflow runs are logged and can be monitored
- Failure notifications are sent automatically
- Performance metrics are available in the GitHub Actions dashboard

## 🔧 Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify all secrets are correctly set in GitHub repository settings
   - Check that service account has proper permissions
   - Ensure tokens are not expired

2. **Rate Limiting**
   - Scripts include built-in rate limiting and retry logic
   - If issues persist, increase delays in configuration

3. **Data Format Issues**
   - Verify Google Sheets column headers match expected names
   - Check that data types are correct (dates, emails, etc.)
   - Ensure required fields are not empty

4. **Slack API Issues**
   - Verify bot token has required scopes
   - Check that bot is added to the workspace
   - Ensure usergroup permissions are correct

### Debug Mode
All scripts support a `DRY_RUN` environment variable for testing:
```bash
DRY_RUN=true npm run slack-usergroups
```

This will run the script without making any actual changes, useful for testing and debugging.

## 📞 Support

For issues or questions regarding the migration:
1. Check the GitHub Actions logs for detailed error messages
2. Review the script logs for specific failure points
3. Verify all secrets are correctly configured
4. Test individual scripts in dry-run mode

The migrated automations maintain 100% functional compatibility with the original Google Apps Script versions while providing improved reliability, maintainability, and monitoring capabilities.
