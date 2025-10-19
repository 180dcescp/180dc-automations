# LinkedIn Blog Sync Setup Instructions

This document explains how to set up the LinkedIn to Sanity blog sync automation.

## Overview

The LinkedIn Blog Sync automatically fetches posts from your LinkedIn organization page from the last 6 months and syncs them to your Sanity CMS blog. It runs daily via GitHub Actions and handles:

- Creating new posts from LinkedIn
- Updating existing posts if content changes
- Deleting posts that were removed from LinkedIn
- Converting LinkedIn images to Sanity assets

## Required GitHub Secrets

You need to add the following secrets to your GitHub repository:

### LinkedIn API Credentials
1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following repository secrets:

- `LINKEDIN_ID`: Your LinkedIn organization ID
- `LINKEDIN_API_KEY`: Your LinkedIn API access token

### Sanity Credentials (if not already added)
- `SANITY_PROJECT_ID`: Your Sanity project ID
- `SANITY_DATASET`: Your Sanity dataset (usually "production")
- `SANITY_TOKEN`: Your Sanity API token with write permissions

## Getting LinkedIn API Credentials

### 1. LinkedIn Developer Account
1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. Create a developer account or sign in
3. Create a new app or use an existing one

### 2. Get Organization ID
1. In your LinkedIn app, go to "Products" tab
2. Add "Community Management API" product
3. Note your Organization ID from the API documentation

### 3. Get API Access Token
1. Go to "Auth" tab in your LinkedIn app
2. Generate a token with the following scopes:
   - `r_organization_social`
   - `w_organization_social`
3. Copy the generated access token

## Testing the Sync

### Manual Test
1. Go to your GitHub repository
2. Navigate to Actions tab
3. Find "LinkedIn Blog Sync" workflow
4. Click "Run workflow" button
5. Select "Run workflow" to trigger manually

### Local Test (Optional)
To test the sync script locally:

1. Create a `.env` file in the `180dc-automations` directory:
```bash
SANITY_PROJECT_ID=your_project_id
SANITY_DATASET=production
SANITY_TOKEN=your_sanity_token
LINKEDIN_ID=your_linkedin_org_id
LINKEDIN_API_KEY=your_linkedin_token
```

2. Run the sync script:
```bash
cd 180dc-automations
node scripts/sync-linkedin-posts.js
```

## Monitoring

### GitHub Actions
- Check the Actions tab in your repository for workflow runs
- Failed runs will show error logs
- Successful runs will show sync statistics

### Sanity Studio
- Check your Sanity Studio to see synced posts
- Posts will appear in the "Blog Post" section
- Each post will have a `linkedinPostId` field for tracking

## Troubleshooting

### Common Issues

1. **LinkedIn API Rate Limits**
   - The script includes rate limiting
   - If you hit limits, the sync will retry automatically

2. **Image Upload Failures**
   - Some LinkedIn images may fail to upload
   - The script will continue with other posts
   - Check logs for specific image errors

3. **Authentication Errors**
   - Verify your LinkedIn API token is valid
   - Check that your organization ID is correct
   - Ensure your Sanity token has write permissions

### Debug Mode
To run in debug mode, set the `DRY_RUN` environment variable to `true` in the GitHub Actions workflow. This will show what would be synced without making actual changes.

## Schedule

The sync runs automatically:
- **Daily at 6:00 AM UTC** via cron schedule
- **Manual trigger** available via GitHub Actions UI

## File Structure

```
.github/workflows/linkedin-blog-sync.yml    # GitHub Actions workflow
scripts/sync-linkedin-posts.js              # Sync script
LINKEDIN_SYNC_SETUP.md                      # This documentation
```

## Support

If you encounter issues:
1. Check the GitHub Actions logs for error details
2. Verify all required secrets are set correctly
3. Test the LinkedIn API credentials manually
4. Check Sanity Studio for any sync results
