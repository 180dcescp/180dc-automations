/**
 * Cloudflare Worker for scheduled website rebuilds.
 * Triggers a rebuild by calling a build webhook URL on a cron schedule.
 *
 * Required secret:
 * - CF_PAGES_BUILD_HOOK_URL: The URL to POST to in order to trigger a website rebuild (Cloudflare Pages build hook)
 */

async function handleHealth() {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'scheduled-rebuild'
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

async function triggerRebuild(env) {
  const webhookUrl = env.CF_PAGES_BUILD_HOOK_URL;
  if (!webhookUrl) {
    console.warn('CF_PAGES_BUILD_HOOK_URL is not set. Skipping rebuild trigger.');
    return { success: false, message: 'Missing CF_PAGES_BUILD_HOOK_URL' };
  }

  const response = await fetch(webhookUrl, { method: 'POST' });
  const ok = response.ok;
  return { success: ok, status: response.status };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const result = await triggerRebuild(env);
        if (result.success) {
          console.log('✅ Scheduled rebuild triggered successfully');
        } else {
          console.error('❌ Scheduled rebuild failed:', result);
        }
      })()
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return handleHealth();
    }

    if (url.pathname === '/rebuild' && request.method === 'POST') {
      const result = await triggerRebuild(env);
      return new Response(
        JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        {
          status: result.success ? 200 : 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        service: 'scheduled-rebuild',
        endpoints: {
          'GET /health': 'Health check',
          'POST /rebuild': 'Trigger rebuild (manual)'
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
