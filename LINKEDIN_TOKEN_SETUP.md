# LinkedIn Access Token Setup Guide

This guide shows you how to generate a LinkedIn access token for the blog sync automation.

## 📋 Prerequisites

- LinkedIn app: `180AnalyticsApp` (Client ID: `78uuoy229ydne3`)
- Access to your LinkedIn app settings
- Your organization's LinkedIn page admin access

## 🔧 Step 1: Add Redirect URL

1. Go to your LinkedIn app: https://www.linkedin.com/developers/apps/78uuoy229ydne3
2. Click on **Auth** tab
3. Under **OAuth 2.0 settings** → **Authorized redirect URLs**
4. Add: `https://localhost/callback` (or `http://localhost:3000/callback`)
5. Click **Update**

## 🔑 Step 2: Generate Authorization Code

### Build Authorization URL

Replace `YOUR_REDIRECT_URL` with the URL you added above:

```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=78uuoy229ydne3&redirect_uri=YOUR_REDIRECT_URL&scope=r_organization_social
```

**Example** (if you used `https://localhost/callback`):
```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=78uuoy229ydne3&redirect_uri=https://localhost/callback&scope=r_organization_social
```

### Get the Code

1. **Copy the authorization URL** from above
2. **Paste it in your browser** and press Enter
3. **Sign in** with your LinkedIn account (must have admin access to your organization)
4. **Approve** the permissions request
5. You'll be redirected to: `https://localhost/callback?code=AUTHORIZATION_CODE&state=...`
6. **Copy the `code` parameter** from the URL (everything between `code=` and `&state`)

**Example redirect:**
```
https://localhost/callback?code=AQTxyz123abc...&state=foobar
```
Copy: `AQTxyz123abc...`

## 🎫 Step 3: Exchange Code for Access Token

### Using Terminal (curl)

Replace:
- `AUTHORIZATION_CODE` with the code from Step 2
- `YOUR_REDIRECT_URL` with your redirect URL
- `YOUR_CLIENT_SECRET` with your Primary Client Secret

```bash
curl -X POST 'https://www.linkedin.com/oauth/v2/accessToken' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=AUTHORIZATION_CODE' \
  -d 'redirect_uri=YOUR_REDIRECT_URL' \
  -d 'client_id=78uuoy229ydne3' \
  -d 'client_secret=YOUR_CLIENT_SECRET'
```

**Example:**
```bash
curl -X POST 'https://www.linkedin.com/oauth/v2/accessToken' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=AQTxyz123abc...' \
  -d 'redirect_uri=https://localhost/callback' \
  -d 'client_id=78uuoy229ydne3' \
  -d 'client_secret=abc123xyz...'
```

### Response

You'll get a JSON response like:
```json
{
  "access_token": "AQV8...very_long_token...xyz",
  "expires_in": 5184000,
  "scope": "r_organization_social",
  "token_type": "Bearer"
}
```

**Copy the `access_token` value** - this is your LinkedIn access token!

## 🔐 Step 4: Add Token to GitHub Secrets

1. Go to your `180dc-automations` repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

### Required Secrets:

| Name | Value |
|------|-------|
| `LINKEDIN_ACCESS_TOKEN` | The access token from Step 3 |
| `LINKEDIN_ORG_ID` | Your LinkedIn organization ID (numeric) |
| `SANITY_PROJECT_ID` | Your Sanity project ID |
| `SANITY_DATASET` | `production` |
| `SANITY_TOKEN` | Your Sanity write token |

### Finding Your Organization ID:

**Method 1: From LinkedIn URL**
1. Go to your organization's LinkedIn page
2. Look at the URL: `linkedin.com/company/YOUR_ORG_ID/`
3. Copy the numeric ID

**Method 2: From API**
```bash
curl -X GET 'https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=YOUR_COMPANY_NAME' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

## ✅ Step 5: Test the Integration

### Local Test (Optional)

Create `.env` file in `180dc-automations/`:
```bash
SANITY_PROJECT_ID=your_project_id
SANITY_DATASET=production
SANITY_TOKEN=your_sanity_token
LINKEDIN_ACCESS_TOKEN=your_linkedin_token
LINKEDIN_ORG_ID=your_org_id
```

Run:
```bash
cd 180dc-automations
node scripts/sync-linkedin-posts.js
```

### GitHub Actions Test

1. Go to **Actions** tab in your repository
2. Find **LinkedIn Blog Sync** workflow
3. Click **Run workflow**
4. Check the logs for success

## ⏰ Token Expiration

- Your token expires in **2 months** (5,184,000 seconds)
- You'll need to regenerate it before expiration
- Set a calendar reminder for ~50 days from now

## 🎬 For LinkedIn API Application

Once this is working:

1. **Record a screen video** showing:
   - Your website blog page
   - LinkedIn posts appearing in Sanity
   - The sync working via GitHub Actions
   - Posts displaying on your website

2. **Submit LinkedIn API application** with:
   - Screen recording link
   - Website URL: https://your-website.com
   - Use case: "Sync LinkedIn posts to website blog"
   - Test credentials: Sanity Studio login

3. **After approval**: Switch to automated token refresh (I'll update the script)

## 🆘 Troubleshooting

### "Invalid redirect_uri"
- Make sure the redirect URL in the authorization URL exactly matches what you added in the app settings

### "Invalid authorization code"
- Authorization codes expire quickly (minutes) - generate a new one
- Make sure you copied the entire code from the URL

### "403 Forbidden" when fetching posts
- Verify your account has admin access to the organization
- Check that `r_organization_social` scope is included

### Token expired
- Generate a new token following Steps 2-4 again
- Update the `LINKEDIN_ACCESS_TOKEN` secret in GitHub

## 📞 Need Help?

Check the GitHub Actions logs for detailed error messages. Most issues are related to:
1. Incorrect redirect URL
2. Expired authorization code
3. Wrong organization ID
4. Missing admin permissions
