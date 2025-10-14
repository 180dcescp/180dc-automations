# Cloudflare Workers Deployment for Read.ai Webhook

This guide shows how to deploy the Read.ai webhook integration using Cloudflare Workers, which is perfect since you're already using Cloudflare!

## 🚀 Quick Deployment

### Option 1: Using Wrangler CLI (Recommended)

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Deploy the worker**:
   ```bash
   wrangler deploy automation/worker.js --name read-ai-webhook
   ```

4. **Set environment variables**:
   ```bash
   wrangler secret put NOTION_TOKEN
   # Enter your Notion token when prompted
   
   wrangler secret put MEETING_DATABASE_ID
   # Enter: 27773333-ed75-8198-a609-e32b6717c83e
   ```

### Option 2: Using Cloudflare Dashboard

1. **Go to Cloudflare Workers Dashboard**:
   - Visit [dash.cloudflare.com](https://dash.cloudflare.com)
   - Go to Workers & Pages
   - Click "Create a Worker"

2. **Upload the worker code**:
   - Copy the contents of `automation/worker.js`
   - Paste into the worker editor
   - Click "Save and Deploy"

3. **Set environment variables**:
   - Go to Settings → Variables
   - Add `NOTION_TOKEN`: `your_notion_integration_token_here`
   - Add `MEETING_DATABASE_ID`: `27773333-ed75-8198-a609-e32b6717c83e`

## 🔧 Configuration

### Environment Variables Required

```env
NOTION_TOKEN=your_notion_integration_token_here
MEETING_DATABASE_ID=27773333-ed75-8198-a609-e32b6717c83e
```

### Custom Domain (Optional)

If you want a custom domain for your webhook:

1. **Go to Workers & Pages** → **read-ai-webhook**
2. **Click "Custom Domains"**
3. **Add your domain**: `webhook.180dc-escp.org`
4. **Configure DNS** in your domain settings

## 📡 Webhook URLs

After deployment, your webhook URLs will be:

- **Default**: `https://read-ai-webhook.your-subdomain.workers.dev/webhook/read-ai`
- **Custom Domain**: `https://webhook.180dc-escp.org/webhook/read-ai` (if configured)

## 🧪 Testing Your Deployment

### 1. Health Check
```bash
curl https://read-ai-webhook.your-subdomain.workers.dev/health
```

### 2. Test Notion Connection
```bash
curl https://read-ai-webhook.your-subdomain.workers.dev/test/notion
```

### 3. Test Webhook Processing
```bash
curl -X POST https://read-ai-webhook.your-subdomain.workers.dev/test/webhook
```

### 4. Test with Sample Data
```bash
curl -X POST https://read-ai-webhook.your-subdomain.workers.dev/webhook/read-ai \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-123",
    "trigger": "meeting_end",
    "title": "Test Meeting",
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T10:30:00Z",
    "participants": ["John Doe"],
    "owner": "John Doe",
    "summary": "Test meeting summary",
    "action_items": ["Test action"],
    "key_questions": ["Test question"],
    "topics": ["Testing"],
    "report_url": "https://example.com",
    "transcript": "Test transcript"
  }'
```

## 🔗 Configure Read.ai

1. **Go to Read.ai Settings**
2. **Add Webhook URL**: `https://read-ai-webhook.your-subdomain.workers.dev/webhook/read-ai`
3. **Set Trigger**: `meeting_end`
4. **Test with a sample meeting**

## 📊 Monitoring

### Cloudflare Analytics
- Go to Workers & Pages → read-ai-webhook
- View Analytics tab for request metrics
- Monitor success/error rates

### Logs
- Go to Workers & Pages → read-ai-webhook
- Click "Logs" to see real-time logs
- Filter by status codes and errors

### Health Endpoints
- `GET /health` - Server health
- `GET /test/notion` - Notion connection test
- `GET /database/schema` - Database schema info

## 🚨 Troubleshooting

### Common Issues

1. **Worker Not Deploying**:
   - Check wrangler login status: `wrangler whoami`
   - Verify worker name is unique
   - Check for syntax errors in worker.js

2. **Environment Variables Not Working**:
   - Use `wrangler secret put` for sensitive data
   - Check variable names match exactly
   - Redeploy after setting variables

3. **Notion Connection Failed**:
   - Verify `NOTION_TOKEN` is correct
   - Check database permissions
   - Test with `/test/notion` endpoint

4. **Webhook Not Received**:
   - Check webhook URL is correct
   - Verify worker is deployed and running
   - Check Cloudflare logs

### Debug Commands

```bash
# Check worker status
wrangler tail read-ai-webhook

# View worker logs
wrangler tail read-ai-webhook --format=pretty

# Test locally
wrangler dev automation/worker.js
```

## 🔒 Security

### Environment Variables
- Use `wrangler secret put` for sensitive data
- Never commit tokens to git
- Rotate tokens regularly

### Worker Security
- Cloudflare Workers automatically provide HTTPS
- Built-in DDoS protection
- Global edge deployment

## 💰 Cost

- **Free Tier**: 100,000 requests/day
- **Paid Tier**: $5/month for 10M requests
- **Perfect for webhook usage**: Very cost-effective

## 🎯 Advantages of Cloudflare Workers

- ✅ **Already using Cloudflare**: Seamless integration
- ✅ **Global edge deployment**: Fast response times worldwide
- ✅ **Serverless**: No server management
- ✅ **Automatic scaling**: Handles traffic spikes
- ✅ **Built-in security**: DDoS protection, HTTPS
- ✅ **Cost-effective**: Free tier covers most use cases
- ✅ **Easy monitoring**: Built-in analytics and logs

## 📞 Support

If you encounter issues:
1. Check Cloudflare Workers documentation
2. Review worker logs in dashboard
3. Test individual endpoints
4. Verify environment variables

## 🚀 Next Steps

1. **Deploy the worker** using the steps above
2. **Test all endpoints** to ensure everything works
3. **Configure Read.ai** with your webhook URL
4. **Monitor logs** for successful webhook processing
5. **Set up alerts** for any failures

Your webhook will be live and ready to receive Read.ai notifications!
