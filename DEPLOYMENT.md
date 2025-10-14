# Webhook Deployment Guide

This guide shows how to deploy the Read.ai webhook integration to various cloud platforms.

## 🚀 Quick Deploy Options

### Option 1: Railway (Recommended - Easiest)

1. **Connect to Railway:**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login to Railway
   railway login
   
   # Deploy from your repo
   railway link
   railway up
   ```

2. **Set Environment Variables:**
   - `NOTION_TOKEN`: Your Notion integration token
   - `MEETING_DATABASE_ID`: `27773333-ed75-8198-a609-e32b6717c83e`
   - `PORT`: Railway will set this automatically

3. **Get Webhook URL:**
   - Railway will provide a URL like: `https://your-app.railway.app`
   - Your webhook endpoint: `https://your-app.railway.app/webhook/read-ai`

### Option 2: Heroku

1. **Install Heroku CLI and deploy:**
   ```bash
   # Install Heroku CLI
   # Then deploy
   heroku create your-webhook-app
   git push heroku main
   ```

2. **Set Environment Variables:**
   ```bash
   heroku config:set NOTION_TOKEN=your_notion_token
   heroku config:set MEETING_DATABASE_ID=27773333-ed75-8198-a609-e32b6717c83e
   ```

3. **Get Webhook URL:**
   - `https://your-webhook-app.herokuapp.com/webhook/read-ai`

### Option 3: Vercel (Serverless)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   cd automation
   vercel --prod
   ```

3. **Set Environment Variables in Vercel Dashboard:**
   - `NOTION_TOKEN`
   - `MEETING_DATABASE_ID`

### Option 4: DigitalOcean App Platform

1. **Connect GitHub repo to DigitalOcean**
2. **Set build command:** `cd automation && npm install`
3. **Set run command:** `cd automation && npm run webhook`
4. **Set environment variables in dashboard**

## 🔧 Environment Variables Required

```env
NOTION_TOKEN=your_notion_integration_token_here
MEETING_DATABASE_ID=27773333-ed75-8198-a609-e32b6717c83e
PORT=3000
```

## 📡 Webhook URL Configuration

Once deployed, your webhook URL will be:
- **Railway**: `https://your-app.railway.app/webhook/read-ai`
- **Heroku**: `https://your-app.herokuapp.com/webhook/read-ai`
- **Vercel**: `https://your-app.vercel.app/webhook/read-ai`

## 🧪 Testing Your Deployment

1. **Health Check:**
   ```bash
   curl https://your-deployed-url.com/health
   ```

2. **Test Webhook:**
   ```bash
   curl -X POST https://your-deployed-url.com/test/webhook
   ```

3. **Test Notion Connection:**
   ```bash
   curl https://your-deployed-url.com/test/notion
   ```

## 🔗 Configure Read.ai

1. **Go to Read.ai Settings**
2. **Add Webhook URL:** `https://your-deployed-url.com/webhook/read-ai`
3. **Set Trigger:** `meeting_end`
4. **Test with a sample meeting**

## 📊 Monitoring

### Health Endpoints
- `GET /health` - Server health
- `GET /test/notion` - Notion connection test
- `GET /database/schema` - Database schema info

### Logs
- Check your platform's logs for webhook processing
- Look for successful webhook processing messages
- Monitor for any errors

## 🚨 Troubleshooting

### Common Issues

1. **Webhook Not Received:**
   - Check webhook URL is correct
   - Verify server is running
   - Check platform logs

2. **Notion Connection Failed:**
   - Verify `NOTION_TOKEN` is correct
   - Check database permissions
   - Test with `/test/notion` endpoint

3. **Database Issues:**
   - Verify `MEETING_DATABASE_ID` is correct
   - Check database exists and is accessible
   - Test with `/database/schema` endpoint

### Debug Commands

```bash
# Test locally
npm run test-webhook
npm run test-notion

# Check server logs
# (Platform specific - check your deployment platform docs)
```

## 🔒 Security Considerations

1. **Environment Variables:**
   - Never commit tokens to git
   - Use platform environment variable settings
   - Rotate tokens regularly

2. **Webhook Security:**
   - Consider adding webhook signature verification
   - Implement rate limiting
   - Monitor for abuse

3. **Server Security:**
   - Use HTTPS (most platforms provide this automatically)
   - Monitor access logs
   - Set up alerts for failures

## 📈 Scaling

- **Railway/Heroku:** Auto-scaling based on traffic
- **Vercel:** Serverless, scales automatically
- **DigitalOcean:** Manual scaling in dashboard

## 💰 Cost Estimates

- **Railway:** Free tier available, $5/month for production
- **Heroku:** Free tier available, $7/month for production
- **Vercel:** Free tier available, $20/month for production
- **DigitalOcean:** $5/month for basic app

## 🎯 Recommended Setup

For production use, I recommend **Railway** because:
- ✅ Easy deployment from git
- ✅ Automatic HTTPS
- ✅ Built-in monitoring
- ✅ Reasonable pricing
- ✅ Good documentation

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section
2. Review platform-specific documentation
3. Check server logs
4. Test individual components
