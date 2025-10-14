# 180DC Automations

Automation scripts for syncing Google Sheets, Slack, and Notion with Sanity CMS, plus Read.ai webhook integration.

## 🏗️ Project Structure

```
180dc-automations/
├── lib/
│   ├── clients/          # API clients (Notion, Slack, Google, etc.)
│   └── utils/           # Utility functions
├── scripts/             # Automation scripts
├── tools/              # Development and testing tools
├── worker.js           # Cloudflare Worker for Read.ai webhooks
├── wrangler.toml       # Cloudflare Workers configuration
└── package.json        # Dependencies and scripts
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
Create an `env` file with your credentials:
```env
NOTION_TOKEN=your_notion_token
MEETING_DATABASE_ID=your_database_id
# ... other variables
```

### 3. Run Scripts
```bash
# Sync team members
npm run sync

# Sync clients
npm run sync-clients

# Run analytics
npm run analytics
```

## 📡 Read.ai Webhook Integration

### Deploy Cloudflare Worker
```bash
# Login to Cloudflare
wrangler login

# Set secrets
wrangler secret put NOTION_TOKEN
wrangler secret put MEETING_DATABASE_ID

# Deploy
npm run deploy:production
```

### Test Webhook
```bash
# Health check
npm run test-health

# Test Notion connection
npm run test-notion

# Test webhook with sample data
npm run test-webhook
```

## 📚 Documentation

- [Cloudflare Deployment Guide](./CLOUDFLARE-DEPLOYMENT.md) - Complete deployment instructions
- [Deployment Guide](./DEPLOYMENT.md) - General deployment options
- [Drive Sync Setup](./DRIVE-SYNC-SETUP.md) - Google Drive integration
- [Migration Guide](./MIGRATION-README.md) - Migration from Google Apps Script

## 🔧 Available Scripts

### Automation Scripts
- `npm run sync` - Sync team members
- `npm run sync-clients` - Sync client data
- `npm run analytics` - Generate analytics reports
- `npm run slack-usergroups` - Sync Slack user groups
- `npm run notion-members` - Sync Notion members
- `npm run notion-clients` - Sync Notion clients

### Cloudflare Worker Scripts
- `npm run dev` - Start local development server
- `npm run deploy` - Deploy to production
- `npm run deploy:staging` - Deploy to staging
- `npm run test-webhook` - Test webhook endpoint
- `npm run test-notion` - Test Notion connection
- `npm run test-health` - Test health endpoint

### Development Tools
- `npm run test-failed-logos` - Test logo processing
- `npm run test-team-avatar-avif` - Test AVIF conversion
- `npm run test-avif` - Test AVIF conversion tools

## 🌐 Webhook Endpoints

Once deployed, your Cloudflare Worker provides these endpoints:

- `GET /health` - Health check
- `GET /test/notion` - Test Notion connection
- `GET /database/schema` - Get database schema
- `GET /test/webhook` - Test webhook with sample data
- `POST /webhook/read-ai` - Read.ai webhook endpoint

## 🔒 Environment Variables

### Required for All Scripts
- `NOTION_TOKEN` - Notion integration token
- `SLACK_BOT_TOKEN` - Slack bot token
- `SANITY_TOKEN` - Sanity CMS token

### Required for Google Services
- `GOOGLE_PROJECT_ID` - Google Cloud project ID
- `GOOGLE_PRIVATE_KEY_ID` - Google service account key ID
- `GOOGLE_PRIVATE_KEY` - Google service account private key
- `GOOGLE_CLIENT_EMAIL` - Google service account email
- `GOOGLE_CLIENT_ID` - Google service account client ID

### Required for Read.ai Webhook
- `MEETING_DATABASE_ID` - Notion database ID for meeting notes

## 🚨 Troubleshooting

### Common Issues
1. **Missing environment variables** - Check your `env` file
2. **API rate limits** - Scripts include rate limiting
3. **Permission errors** - Verify API tokens have correct permissions
4. **Webhook not working** - Check Cloudflare Worker logs

### Debug Commands
```bash
# Test connections
npm run test

# Check worker logs
wrangler tail

# Test specific endpoints
curl https://your-worker.workers.dev/health
```

## 📞 Support

For issues:
1. Check the troubleshooting section
2. Review the deployment guides
3. Check logs and error messages
4. Test individual components

## 🔄 Updates

To update the project:
1. Pull latest changes
2. Run `npm install` if dependencies changed
3. Update environment variables if needed
4. Test your changes
5. Deploy if using Cloudflare Workers

---

**Status**: ✅ Rebuilt and ready for deployment
**Last Updated**: January 2024