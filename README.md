# 180DC Scheduled Rebuild Worker

Minimal Cloudflare Worker that triggers a scheduled website rebuild via a webhook.

## 🏗️ Project structure
```
180dc-automations/
├── worker.js           # Cloudflare Worker for scheduled rebuilds
├── wrangler.toml       # Cloudflare Workers configuration
└── package.json        # Scripts and dev dependency (wrangler)
```

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set required secret
Set the rebuild webhook URL (Cloudflare Pages Build Hook) as a Worker secret:
```bash
wrangler secret put CF_PAGES_BUILD_HOOK_URL
```

### 3. Deploy
```bash
npm run deploy:production
```

## Endpoints
Once deployed, the Worker provides:
- `GET /health` - Health check
- `POST /rebuild` - Manually trigger a rebuild

## 📚 Documentation
- Scripts: `scripts/README.md`
- Tools: `tools/README.md`

## 🔧 Scripts
- `npm run dev` - Start local dev server
- `npm run deploy` - Deploy to default environment
- `npm run deploy:staging` - Deploy to staging
- `npm run deploy:production` - Deploy to production
- `npm run test-health` - Test health endpoint

## 🔒 Environment variables
- `CF_PAGES_BUILD_HOOK_URL` - Secret URL to trigger your Cloudflare Pages build

## 🚨 Troubleshooting
```bash
# View logs
wrangler tail

# Health endpoint
curl https://your-worker.workers.dev/health
```

---
**Status**: ✅ Minimal scheduled rebuild worker
**Last Updated**: October 2025