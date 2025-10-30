// index.ts
// Entrypoint for Cloudflare Worker
// Trigger: POST /process-email
// ENV REQUIRED:
// - GMAIL_CLIENT_EMAIL
// - GMAIL_PRIVATE_KEY
// - GMAIL_USER (comma-separated if >1)
// - GSHEET_PROJECT_ID
// - GSHEET_CLIENT_EMAIL
// - GSHEET_PRIVATE_KEY
// - GSHEET_SHEET_ID
// - GSHEET_EMAIL_RANGE
// - Any secrets for SENDING ACTIONS
import { getGmailClient, listRecentMessages, getMessage, sendEmail, sendReply } from './gmail';
import { getExecutiveEmails } from './memberSheet';
import { isLikelyHumanEmail } from './utils';
import { promises as fs } from 'fs';

interface EnvVars extends Record<string, string> {}

async function sendAutoReply({ gmail, user, msg, env }: any) {
  const template = (await fs.readFile('auto_reply_template.txt')).toString();
  const from = msg.payload.headers.find((h:any) => h.name==='From')?.value;
  const subject = msg.payload.headers.find((h:any) => h.name==='Subject')?.value;
  const to = from;
  const replyMime = `To: ${to}\nSubject: Re: ${subject}\nIn-Reply-To: ${msg.id}\nReferences: ${msg.id}\nContent-Type: text/html; charset=UTF-8\nFrom: Executive Team <escp@180dc.org>\n\n${template}`;
  const raw = Buffer.from(replyMime).toString('base64url');
  await sendReply({ gmail, user, threadId: msg.threadId, raw });
}

async function forwardToExecs({ gmail, msg, execs, env }: any) {
  const origFrom = msg.payload.headers.find((h:any) => h.name==='From')?.value;
  const origEmail = /<([^>]+)>/.exec(origFrom)?.[1] || origFrom || '';
  const origSubject = msg.payload.headers.find((h:any) => h.name==='Subject')?.value;
  const origBody = Buffer.from(msg.payload.parts?.[0]?.body?.data || '', 'base64').toString();
  const coverNote = `<div style=\"font-family:Avenir,Arial,sans-serif;font-size:15px;line-height:1.45;\"><b>Executive Team - Automated Forward</b><br/><br/>
    This email was automatically forwarded from <b>escp@180dc.org</b>.<br/>
    The sender already received our standard information reply with links to the website and socials (see below).<br/>
    <span style=\"color:#2566C6\"><b>When you reply to this email, your response will go directly to the sender, not the shared mailbox.</b></span><br/>
    Please review and respond if appropriate.<br/><hr style=\"margin:12px 0\"/></div>`;
  const template = (await fs.readFile('auto_reply_template.txt')).toString();
  const html = [coverNote,
    `<b>Original Sender:</b> ${origFrom || ''}<br/><b>Subject:</b> ${origSubject || ''}<hr/>`,
    `<div style=\"background:#f8f8f8;padding:8px;border-radius:3px;\"><pre style=\"white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:15px;\">${origBody}</pre></div>`,
    '<hr/>', template].join('\n');
  let to = execs.map((mem:any) => mem.email).join(',');
  if (env.TEST_FORWARD_EMAIL) to = env.TEST_FORWARD_EMAIL;
  const forwardMime = `To: ${to}\nSubject: FWD: ${origSubject}\nFrom: Executive Team <escp@180dc.org>\nReply-To: ${origEmail}\nContent-Type: text/html; charset=UTF-8\n\n${html}`;
  const raw = Buffer.from(forwardMime).toString('base64url');
  await sendEmail(gmail, 'escp@180dc.org', raw);
}

export default {
  async fetch(request: Request, env: EnvVars, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/process-email') {
      try {
        const execs = await getExecutiveEmails(env); // [{email, ...}]
        const gmail = await getGmailClient({ ...env, GMAIL_USER: 'escp@180dc.org' });
        const messages = await listRecentMessages(gmail, 'escp@180dc.org', 'is:inbox is:unread', 5);
        const results: any[] = [];
        for (const messageMeta of messages) {
          const msg = await getMessage(gmail, 'escp@180dc.org', messageMeta.id);
          const raw = Buffer.from(msg.raw || '', 'base64').toString();
          const humanLikely = await isLikelyHumanEmail(raw);
          if (humanLikely) {
            await sendAutoReply({ gmail, user: 'escp@180dc.org', msg, env });
            await forwardToExecs({ gmail, msg, execs, env });
            results.push({ id: messageMeta.id, status: 'forwarded+autoreplied' });
          } else {
            results.push({ id: messageMeta.id, status: 'skipped-bot' });
          }
        }
        return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
    if (request.method === 'GET' && url.pathname === '/debug/execs') {
      const execs = await getExecutiveEmails(env);
      return new Response(JSON.stringify(execs.map(x=>x.email)), {status:200, headers:{'Content-Type':'application/json'}});
    }
    if (request.method === 'GET') {
      return new Response('Cloudflare Email Worker active.', { status: 200 });
    }
    return new Response('Not found.', { status: 404 });
  }
};
