# Google Drive Transcript Sync Setup

This document explains how to set up the Google Drive transcript sync automation that monitors a specific Google Drive folder for transcript files and syncs them to your Notion database.

## 🎯 Overview

The automation:
- **Runs weekly** (every Monday at 10 AM UTC)
- **Monitors** the Google Drive folder: `https://drive.google.com/drive/folders/1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`
- **Processes** transcript files** (`.txt`, `.doc`, `.docx`, `.pdf` files with transcript-related keywords)
- **Creates** Notion pages for new transcript files
- **Sends** Slack notifications on success/failure
- **Prevents** duplicate processing by tracking already processed files

## 🔧 Required Secrets

You need to add these secrets to your GitHub repository:

### Already Configured (from existing automations):
- `NOTION_TOKEN` - Your Notion integration token
- `MEETING_DATABASE_ID` - Your Notion meeting database ID
- `SLACK_BOT_TOKEN` - Your Slack bot token
- `SLACK_CHANNEL` - Your Slack channel for notifications
- `GOOGLE_PROJECT_ID` - Your Google Cloud project ID
- `GOOGLE_PRIVATE_KEY_ID` - Your Google service account private key ID
- `GOOGLE_PRIVATE_KEY` - Your Google service account private key
- `GOOGLE_CLIENT_EMAIL` - Your Google service account email
- `GOOGLE_CLIENT_ID` - Your Google service account client ID

### New Secret Required:
- `GOOGLE_DRIVE_FOLDER_ID` - Set to: `1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`

## 📋 Setup Instructions

### 1. Add the New Secret

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `GOOGLE_DRIVE_FOLDER_ID`
5. Value: `1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`
6. Click **Add secret**

### 2. Grant Google Drive Access

Your existing Google service account needs access to the Google Drive folder:

1. **Share the Google Drive folder** with your service account email
2. **Grant "Viewer" permission** to the service account
3. **Verify** the service account can access the folder

### 3. Test the Automation

You can test the automation manually:

1. Go to **Actions** tab in your GitHub repository
2. Find **"Sync Google Drive Transcripts to Notion"**
3. Click **"Run workflow"**
4. Select **"test_mode: true"** to test connections only
5. Click **"Run workflow"**

## 📁 Supported File Types

The automation processes files with:
- **Extensions**: `.txt`, `.doc`, `.docx`, `.pdf`
- **All files** with these extensions are processed (no keyword filtering)

## 🔍 How It Works

### 1. File Detection
- Scans the Google Drive folder for files
- Filters for supported file types (`.txt`, `.doc`, `.docx`, `.pdf`)
- Checks if files have already been processed

### 2. Content Processing
- Downloads file content from Google Drive
- Extracts meeting information from filename and content
- Parses participants, summary, action items, etc.

### 3. Notion Integration
- Creates new pages in your Notion meeting database
- Uses the same database structure as Read.ai webhooks
- Prevents duplicates by tracking processed files

### 4. Notifications
- Sends success notifications with processing summary
- Sends failure notifications with error details
- All notifications go to your configured Slack channel

## 📊 Notion Database Structure

The automation creates pages with these properties:
- **Meeting Title** - Extracted from filename
- **Start Time** - From filename or file creation date
- **End Time** - File modification date
- **Participants** - Extracted from content
- **Owner** - Set to "Drive Sync"
- **Summary** - Extracted from content
- **Action Items** - Extracted from content
- **Key Questions** - Extracted from content
- **Topics** - Extracted from content
- **Report URL** - Google Drive file link
- **Session ID** - Google Drive file ID
- **Transcript** - Full file content

## 🚨 Troubleshooting

### Common Issues:

1. **"Google Drive connection failed"**
   - Check that your service account has access to the folder
   - Verify all Google secrets are correctly set

2. **"Notion connection failed"**
   - Verify `NOTION_TOKEN` and `MEETING_DATABASE_ID` are correct
   - Check that the Notion integration has access to the database

3. **"No new transcript files found"**
   - This is normal if all files have been processed
   - Check that files match the supported criteria

4. **"Failed to create Notion page"**
   - Check Notion database permissions
   - Verify the database structure matches expectations

### Manual Testing:

```bash
# Test connections
cd automation
npm run sync-drive-transcripts
```

## 📅 Schedule

- **Frequency**: Weekly (every Monday at 10 AM UTC)
- **Manual Trigger**: Available via GitHub Actions
- **Test Mode**: Available for connection testing

## 🔄 Workflow Details

The automation:
1. **Connects** to Google Drive, Notion, and Slack
2. **Loads** list of already processed files from Notion
3. **Scans** Google Drive folder for new transcript files
4. **Processes** each new file:
   - Downloads content
   - Extracts meeting data
   - Creates Notion page
5. **Sends** Slack notification with results

## 📈 Monitoring

- **Success notifications** include processing summary
- **Failure notifications** include error details
- **GitHub Actions logs** provide detailed execution information
- **Notion database** shows all processed files

## 🛠️ Customization

You can modify the automation by editing:
- **File filtering criteria** in `sync-drive-transcripts.js`
- **Content extraction logic** for better parsing
- **Schedule frequency** in the GitHub Action workflow
- **Notification messages** in the Slack integration

## 📞 Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Verify all secrets are correctly configured
3. Test connections using the test mode
4. Check Slack notifications for error details
