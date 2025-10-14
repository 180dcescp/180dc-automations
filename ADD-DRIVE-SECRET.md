# Add Google Drive Folder Secret

## 🚨 Issue
The automation is failing because the `GOOGLE_DRIVE_FOLDER_ID` secret is not set in your GitHub repository.

## 🔧 Quick Fix

### Step 1: Add the Secret
1. Go to your GitHub repository: `https://github.com/YOUR_USERNAME/180dc-escp-website`
2. Click **Settings** (top menu)
3. Click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. **Name**: `GOOGLE_DRIVE_FOLDER_ID`
6. **Value**: `1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`
7. Click **Add secret**

### Step 2: Verify the Secret
1. Go to **Actions** tab in your repository
2. Find **"Sync Google Drive Transcripts to Notion"**
3. Click **"Run workflow"**
4. Click **"Run workflow"** (without test mode)
5. Check the logs - you should see: `✅ All required secrets are configured`

## 📋 Complete Secret List

Make sure you have all these secrets in your repository:

### ✅ Already Configured (from existing automations):
- `NOTION_TOKEN`
- `MEETING_DATABASE_ID`
- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL`
- `GOOGLE_PROJECT_ID`
- `GOOGLE_PRIVATE_KEY_ID`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_CLIENT_ID`

### ❌ Missing (needs to be added):
- `GOOGLE_DRIVE_FOLDER_ID` = `1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`

## 🔍 Troubleshooting

If you still get errors after adding the secret:

1. **Check the secret name**: Make sure it's exactly `GOOGLE_DRIVE_FOLDER_ID`
2. **Check the value**: Make sure it's exactly `1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP`
3. **Check permissions**: Make sure your service account has access to the Google Drive folder
4. **Check the logs**: Look for the "Verify required secrets" step in the GitHub Actions logs

## 🧪 Test the Fix

After adding the secret, run the workflow manually:
1. Go to **Actions** → **Sync Google Drive Transcripts to Notion**
2. Click **"Run workflow"**
3. Select **"test_mode: true"** to test connections only
4. Click **"Run workflow"**

You should see:
- ✅ All required secrets are configured
- ✅ Google Drive connection successful
- ✅ Notion connection successful
- ✅ Slack connection successful
