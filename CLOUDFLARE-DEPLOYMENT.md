# 180DC Scheduled Rebuild Worker

This guide explains deploying a minimal Cloudflare Worker that triggers a scheduled website rebuild via a webhook.

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
The project uses `wrangler.toml` for Cloudflare Workers configuration. This file is set up with:
- Worker name: `180dc-scheduled-rebuild`
- Main entry point: `worker.js`
- Cron trigger for scheduled runs (default: 06:00 UTC daily)

### 3. Log in to Cloudflare
```bash
# Install Wrangler CLI (if not already installed)
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### 4. Set Required Secret
Set the webhook URL used to trigger your website rebuild (Cloudflare Pages Build Hook):
```bash
wrangler secret put CF_PAGES_BUILD_HOOK_URL
```

### 5. Deploy the Worker
```bash
# Deploy to production
npm run deploy:production

# Or deploy to staging first
npm run deploy:staging
```

### 6. Schedule
`wrangler.toml` includes a cron trigger, defaulting to 06:00 UTC daily. Adjust as desired.

## 🧪 Testing

### Health Check
```bash
curl https://180dc-scheduled-rebuild.your-subdomain.workers.dev/health
```

### Trigger Rebuild Manually
```bash
curl -X POST https://180dc-scheduled-rebuild.your-subdomain.workers.dev/rebuild
```

## Notes
- Ensure `CF_PAGES_BUILD_HOOK_URL` is a secure, secret URL provided by your platform.
- Monitor logs with `wrangler tail` to confirm scheduled runs.