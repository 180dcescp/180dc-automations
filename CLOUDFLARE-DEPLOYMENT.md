# 180DC Read.ai Webhook Deployment Guide

This guide provides step-by-step instructions for rebuilding and deploying the 180DC Read.ai webhook integration using Cloudflare Workers.

## 🚀 Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd 180dc-automations

# Install dependencies
npm install
```

### 2. Ensure Config File

The project uses `wrangler.toml` for Cloudflare Workers configuration. This file is already set up with:
- Worker name: `180dc-read-ai-webhook`
- Main entry point: `worker.js`
- Environment configurations for staging and production

### 3. Log in to Cloudflare

```bash
# Install Wrangler CLI (if not already installed)
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### 4. Set Required Secrets

Set the required environment variables as Cloudflare Worker secrets:

```bash
# Set Notion integration token
wrangler secret put NOTION_TOKEN

# Set Notion database ID for meeting notes
wrangler secret put MEETING_DATABASE_ID
```

When prompted, enter:
- `NOTION_TOKEN`: Your Notion integration token
- `MEETING_DATABASE_ID`: Your Notion database ID (e.g., `27773333-ed75-8198-a609-e32b6717c83e`)

### 5. Deploy the Worker

```bash
# Deploy to production
npm run deploy:production

# Or deploy to staging first
npm run deploy:staging
```

### 6. Get the Worker URL

After deployment, you'll get a URL like:
```
https://180dc-read-ai-webhook.your-subdomain.workers.dev
```

Your webhook endpoint will be:
```
https://180dc-read-ai-webhook.your-subdomain.workers.dev/webhook/read-ai
```

## 🧪 Testing Your Deployment

### Health Check
```bash
curl https://180dc-read-ai-webhook.your-subdomain.workers.dev/health
```

### Test Notion Connection
```bash
curl https://180dc-read-ai-webhook.your-subdomain.workers.dev/test/notion
```

### Test Webhook with Sample Data
```bash
curl https://180dc-read-ai-webhook.your-subdomain.workers.dev/test/webhook
```

### Get Database Schema
```bash
curl https://180dc-read-ai-webhook.your-subdomain.workers.dev/database/schema
```

## 📡 Read.ai Webhook Setup

### 1. Configure Read.ai Webhook

In Read.ai settings:
1. **Webhook URL**: `https://180dc-read-ai-webhook.your-subdomain.workers.dev/webhook/read-ai`
2. **Trigger**: `meeting_end`
3. **Test with a sample meeting**

### 2. Webhook Payload Structure

The worker expects Read.ai to send data in this format:

```json
{
  "meeting_title": "180DC Strategy Meeting",
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T11:00:00Z",
  "participants": ["John Doe", "Jane Smith"],
  "summary": "Meeting summary...",
  "action_items": ["Task 1", "Task 2"],
  "key_questions": ["Question 1", "Question 2"],
  "topics": ["Strategy", "Planning"],
  "transcript": "Full meeting transcript...",
  "report_url": "https://read.ai/reports/...",
  "session_id": "meeting-123",
  "meeting_type": "Exec"
}
```

## 🗄️ Notion Prerequisites

### 1. Notion Integration Setup

1. **Create Notion Integration**:
   - Go to [notion.so/my-integrations](https://notion.so/my-integrations)
   - Create new integration
   - Copy the integration token

2. **Database Setup**:
   - Create or use existing Notion database
   - Copy the database ID from the URL
   - Share the database with your integration

### 2. Required Database Properties

Ensure your Notion database has these properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| Meeting Title | Title | Meeting title |
| Date | Date | Meeting date |
| Participants | Multi-select | Meeting participants |
| Summary | Rich Text | Meeting summary |
| Topics | Multi-select | Meeting topics |
| Type | Select | Meeting type (Exec, etc.) |
| Comments | Rich Text | Additional comments |
| Report URL | URL | Read.ai report URL |

### 3. Test Notion Connection

```bash
# Test the connection
curl https://180dc-read-ai-webhook.your-subdomain.workers.dev/test/notion

# Check database schema
curl https://180dc-read-ai-webhook.your-subdomain.workers.dev/database/schema
```

## 🔧 Development

### Local Development

```bash
# Start local development server
npm run dev

# This will start the worker locally at http://localhost:8787
```

### Testing Locally

```bash
# Test health endpoint
curl http://localhost:8787/health

# Test webhook endpoint
curl -X POST http://localhost:8787/webhook/read-ai \
  -H "Content-Type: application/json" \
  -d '{"meeting_title": "Test Meeting"}'
```

## 📊 Monitoring and Logs

### View Logs

```bash
# View real-time logs
wrangler tail

# View logs for specific environment
wrangler tail --env production
```

### Monitor Performance

- Check Cloudflare Workers dashboard for metrics
- Monitor request success/failure rates
- Set up alerts for webhook failures

## 🚨 Troubleshooting

### Common Issues

1. **Worker Not Deploying**:
   ```bash
   # Check wrangler configuration
   wrangler whoami
   
   # Verify secrets are set
   wrangler secret list
   ```

2. **Notion Connection Failed**:
   - Verify `NOTION_TOKEN` is correct
   - Check database permissions
   - Test with `/test/notion` endpoint

3. **Webhook Not Receiving Data**:
   - Verify webhook URL in Read.ai
   - Check worker logs: `wrangler tail`
   - Test with sample payload

4. **Database Issues**:
   - Verify `MEETING_DATABASE_ID` is correct
   - Check database exists and is accessible
   - Test with `/database/schema` endpoint

### Debug Commands

```bash
# Check worker status
wrangler whoami

# List secrets
wrangler secret list

# View worker logs
wrangler tail

# Test specific endpoint
curl -X GET https://180dc-read-ai-webhook.your-subdomain.workers.dev/health
```

## 🔒 Security Considerations

1. **Environment Variables**:
   - Never commit secrets to git
   - Use `wrangler secret put` for sensitive data
   - Rotate tokens regularly

2. **Webhook Security**:
   - Consider adding webhook signature verification
   - Implement rate limiting
   - Monitor for abuse

3. **Worker Security**:
   - Use HTTPS (Cloudflare provides this automatically)
   - Monitor access logs
   - Set up alerts for failures

## 📈 Scaling

- **Cloudflare Workers**: Auto-scaling based on traffic
- **Global Edge**: Workers run at edge locations worldwide
- **No cold starts**: Workers are always warm

## 💰 Cost Estimates

- **Cloudflare Workers**: 
  - Free tier: 100,000 requests/day
  - Paid: $0.50 per million requests
  - Very cost-effective for webhook processing

## 🎯 Production Checklist

- [ ] Worker deployed successfully
- [ ] Secrets configured correctly
- [ ] Notion connection tested
- [ ] Webhook URL configured in Read.ai
- [ ] Test webhook with sample data
- [ ] Monitor logs for any errors
- [ ] Set up alerts for failures

## 📞 Support

If you encounter issues:

1. **Check the troubleshooting section above**
2. **Review Cloudflare Workers documentation**
3. **Check worker logs**: `wrangler tail`
4. **Test individual components**:
   - Health: `/health`
   - Notion: `/test/notion`
   - Webhook: `/test/webhook`

## 🔄 Updates and Maintenance

### Updating the Worker

```bash
# Make your changes to worker.js
# Deploy updates
npm run deploy:production
```

### Updating Secrets

```bash
# Update a secret
wrangler secret put NOTION_TOKEN
```

### Monitoring

- Set up monitoring for webhook success rates
- Monitor Notion API usage
- Track worker performance metrics

---

## 📋 Quick Reference

### Essential Commands

```bash
# Deploy
npm run deploy:production

# Test
npm run test-health
npm run test-notion
npm run test-webhook

# Monitor
wrangler tail
```

### Key URLs

- **Health**: `https://180dc-read-ai-webhook.your-subdomain.workers.dev/health`
- **Webhook**: `https://180dc-read-ai-webhook.your-subdomain.workers.dev/webhook/read-ai`
- **Test**: `https://180dc-read-ai-webhook.your-subdomain.workers.dev/test/webhook`

### Environment Variables

- `NOTION_TOKEN`: Notion integration token
- `MEETING_DATABASE_ID`: Notion database ID for meeting notes