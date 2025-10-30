// Email forward + auto-reply hourly runner (GitHub Action friendly)
// Runtime: Node 18+ (ESM). Uses googleapis and process.env for secrets.

import { google } from 'googleapis';

// ========= CONFIG (org + signature) =========
const ORG_NAME = '180 Degrees Consulting ESCP';
const WEBSITE = 'https://180dc-escp.org/';
const WEBSITE_SHORT = '180dc-escp.org';
const IG_URL = 'https://www.instagram.com/180dcescp/';
const LI_URL = 'https://www.linkedin.com/company/180-degrees-consulting-escp';
const LOGO_IMG = 'https://ci3.googleusercontent.com/mail-sig/AIorK4zVsdWs3UwL1Eo1aUQJ3AkEGmwXdPhWGw1Q8lIiv5BQhWbIO6uYvCfGlsmJp2-JxmVPr-_IT3HUQqGf';
const ICON_MAIL = 'https://ci3.googleusercontent.com/mail-sig/AIorK4zhNcznQPZfuypAvZItl4plIiEMQ0lIrwLDr1OasnBHoZvSdw2474JJ-GUKQnHWsuDqp8hwqIQCWTwI';
const ICON_WEB = 'https://ci3.googleusercontent.com/mail-sig/AIorK4wPUicMUnSqg1Oq5fqMQg6irEH6O_Iwm-EhOemBuyG-EqU7aIM3erBb991CwF0nwJX3UMM7tRaUBUyJ';
const ICON_IG = 'https://ci3.googleusercontent.com/mail-sig/AIorK4xX-BQo6US7CwqZHlCbFvajIGt0P5BNK-WDiWbnBOtXGnFSp30yHAHLHm2t1wNWYDourvrfiUqCF_H-';
const ICON_LI = 'https://ci3.googleusercontent.com/mail-sig/AIorK4y9VYe7f6Lh-RpP_jU6lgNoTB1OQeK2wN7o0zSp961rnl83DxxZy6A5HJ0y77i0_hHPsgcg2b2hn6E1';

// ========= ENV (required) =========
const GMAIL_USER = process.env.GMAIL_USER || 'escp@180dc.org';
const GMAIL_CLIENT_EMAIL = process.env.GMAIL_CLIENT_EMAIL;
const GMAIL_PRIVATE_KEY = (process.env.GMAIL_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const GSHEET_CLIENT_EMAIL = process.env.GSHEET_CLIENT_EMAIL;
const GSHEET_PRIVATE_KEY = (process.env.GSHEET_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GSHEET_PROJECT_ID = process.env.GSHEET_PROJECT_ID;
const GSHEET_SHEET_ID = process.env.GSHEET_SHEET_ID;
const GSHEET_EMAIL_RANGE = process.env.GSHEET_EMAIL_RANGE || 'Execs!A:Z';

const TEST_FORWARD_EMAIL = process.env.TEST_FORWARD_EMAIL || '';
const MAX_MESSAGES = parseInt(process.env.MAX_MESSAGES || '5', 10);

// ========= Helpers =========
function buildSignatureHtml() {
  return `
  <table border="0" cellpadding="0" cellspacing="0" style="color:#000;font-family:Avenir,Arial,sans-serif;line-height:3px;font-size:1px;padding:0;border-spacing:0;margin:0;border-collapse:collapse">
    <tr>
      <td style="padding-bottom:4px">
        <table border="0" cellpadding="0" cellspacing="0" style="line-height:3px;padding:0;border-spacing:0;margin:0;border-collapse:collapse">
          <tr>
            <td valign="middle" style="line-height:0;padding-left:11px">
              <a href="${WEBSITE}" target="_blank" style="color:#1155cc">
                <img width="79" height="85" alt="${WEBSITE_SHORT}" border="0" src="${LOGO_IMG}">
              </a>
            </td>
            <td width="11" style="padding-right:11px;width:11px"></td>
            <td width="5"  style="background-color:#414042;width:1.5px"></td>
            <td width="11" style="padding-right:11px;width:11px"></td>
            <td valign="middle" style="font-size:13px;line-height:15px;color:#414042">
              <div style="font-size:13px;line-height:12px;font-weight:bold;color:#73B744;font-family:Avenir,Arial,sans-serif;">Executive Team</div>
              <div style="line-height:12px;color:#414042;font-family:Avenir,Arial,sans-serif;"><span style="font-family:Avenir,Arial,sans-serif;font-weight:normal;">${ORG_NAME}</span></div>
              <div style="font-size:13px;line-height:1px;padding-bottom:5px;padding-top:5px;clear:both;">
                <div style="float:left;padding-right:10px;">
                  <img width="18" height="14" alt="" src="${ICON_MAIL}">
                  <span style="font-size:12px;line-height:10px;font-family:Avenir,Arial,sans-serif;">
                    <a href="mailto:${GMAIL_USER}" style="color:#1155cc" target="_blank">${GMAIL_USER}</a>
                  </span>
                </div>
                <div style="float:left;padding-right:10px;">
                  <img width="17" height="17" alt="" src="${ICON_WEB}">
                  <span style="font-size:12px;line-height:10px;font-family:Avenir,Arial,sans-serif;">
                    <a href="${WEBSITE}" style="color:#414042" target="_blank">${WEBSITE_SHORT}</a>
                  </span>
                </div>
                <div style="clear:both;"></div>
              </div>
              <div style="padding-bottom:1px;font-size:15px;line-height:15px">
                <a href="${IG_URL}" target="_blank" style="display:inline"><img width="20" height="20" alt="Instagram" src="${ICON_IG}"></a>
                &nbsp;<a href="${LI_URL}" target="_blank" style="display:inline"><img width="20" height="20" alt="LinkedIn" src="${ICON_LI}"></a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(s = '') {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAutoReplyHtml() {
  return `
  <div style="font-family:Avenir,Arial,sans-serif;font-size:16px;">
    <p>Thank you for reaching out to ${ORG_NAME}.</p>
    <p>Your email to <b>${GMAIL_USER}</b> was received and automatically forwarded to our Executive Team.<br/>
    If your message requires further action, a team member will respond as soon as possible.</p>
    <p>For more information about our organisation, please visit our <a href="${WEBSITE}">website</a> or connect with us on social media:<br/>
    <a href="${IG_URL}">Instagram</a> | <a href="${LI_URL}">LinkedIn</a></p>
    <hr style="margin:16px 0;"/>
    ${buildSignatureHtml()}
  </div>`;
}

function buildExecCoverNoteHtml() {
  return `
  <div style="font-family:Avenir,Arial,sans-serif;font-size:15px;line-height:1.45;">
    <b>Executive Team - Automated Forward</b><br/><br/>
    This email was automatically forwarded from <b>${GMAIL_USER}</b>.<br/>
    The sender already received our standard information reply with links to the website and socials (see below).<br/>
    <span style="color:#2566C6"><b>When you reply to this email, your response will go directly to the sender, not the shared mailbox.</b></span><br/>
    Please review and respond if appropriate.<br/>
    <hr style="margin:12px 0"/>
  </div>`;
}

// ========= Google Clients =========
async function getGmail() {
  const jwt = new google.auth.JWT(
    GMAIL_CLIENT_EMAIL,
    undefined,
    GMAIL_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/gmail.modify'],
    GMAIL_USER
  );
  await jwt.authorize();
  return google.gmail({ version: 'v1', auth: jwt });
}

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: GSHEET_PROJECT_ID,
      private_key: GSHEET_PRIVATE_KEY,
      client_email: GSHEET_CLIENT_EMAIL,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ========= Exec retrieval =========
async function getExecRecipients() {
  const sheets = await getSheets();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: GSHEET_SHEET_ID,
    range: GSHEET_EMAIL_RANGE,
  });
  const values = data.values || [];
  if (values.length < 2) return [];
  const headers = values[0].map((h) => (h || '').toLowerCase());
  const idx = {
    email: headers.findIndex((h) => h.includes('email')),
    department: headers.findIndex((h) => h.includes('department')),
    status: headers.findIndex((h) => h.includes('status')),
  };
  return values.slice(1)
    .map((row) => ({
      email: (row[idx.email] || '').trim(),
      department: (row[idx.department] || '').trim(),
      status: (row[idx.status] || '').trim(),
    }))
    .filter((x) => x.email && x.status.toLowerCase() === 'active' && x.department.toLowerCase() !== 'consultants')
    .map((x) => x.email);
}

// ========= Gmail helpers =========
async function listUnreadMessages(gmail) {
  const res = await gmail.users.messages.list({ userId: GMAIL_USER, q: 'is:inbox is:unread', maxResults: MAX_MESSAGES });
  return res.data.messages || [];
}

async function getFullMessage(gmail, id) {
  const res = await gmail.users.messages.get({ userId: GMAIL_USER, id, format: 'full' });
  return res.data;
}

function getHeader(msg, name) {
  const h = msg?.payload?.headers?.find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function extractPlainBody(msg) {
  const payload = msg.payload || {};
  const mime = payload.mimeType || '';
  const parts = payload.parts || [];
  if (mime === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString();
  }
  const plain = parts.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  if (plain) return Buffer.from(plain.body.data, 'base64').toString();
  const html = parts.find((p) => p.mimeType === 'text/html' && p.body?.data);
  if (html) return Buffer.from(html.body.data, 'base64').toString();
  return msg.snippet || '';
}

function isLikelyHuman({ from, subject, body }) {
  const botFrom = /(no-?reply|do-?not-?reply|mailer-daemon|notification|bot@)/i.test(from);
  if (botFrom) return false;
  if (/auto.?reply|receipt|password|otp|verify|code|notification|alert/i.test(subject)) return false;
  if (!body || body.length < 20) return false;
  if (/unsubscribe|privacy|terms|automated/i.test(body)) return false;
  return true;
}

async function sendAutoReply(gmail, originalMsg) {
  const from = getHeader(originalMsg, 'From');
  const subject = getHeader(originalMsg, 'Subject');
  const html = buildAutoReplyHtml();
  const raw = Buffer.from(
    `To: ${from}\nSubject: Re: ${subject}\nIn-Reply-To: ${originalMsg.id}\nReferences: ${originalMsg.id}\nContent-Type: text/html; charset=UTF-8\nFrom: Executive Team <${GMAIL_USER}>\n\n${html}`
  ).toString('base64url');
  await gmail.users.messages.send({ userId: GMAIL_USER, requestBody: { raw, threadId: originalMsg.threadId } });
}

async function forwardToExecs(gmail, originalMsg, recipientEmails) {
  const from = getHeader(originalMsg, 'From');
  const subject = getHeader(originalMsg, 'Subject');
  const body = extractPlainBody(originalMsg);
  const senderEmailMatch = /<([^>]+)>/.exec(from);
  const senderEmail = senderEmailMatch?.[1] || from;

  const cover = buildExecCoverNoteHtml();
  const signature = buildSignatureHtml();
  const composedHtml = [
    cover,
    `<b>Original Sender:</b> ${escapeHtml(from)}<br/><b>Subject:</b> ${escapeHtml(subject)}<hr/>`,
    `<div style="background:#f8f8f8;padding:8px;border-radius:3px;"><pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:15px;">${escapeHtml(body)}</pre></div>`,
    '<hr/>',
    signature,
  ].join('\n');

  const to = TEST_FORWARD_EMAIL || recipientEmails.join(',');
  if (!to) {
    console.log('No exec recipients found; skipping forward.');
    return;
  }

  const raw = Buffer.from(
    `To: ${to}\nSubject: FWD: ${subject}\nFrom: Executive Team <${GMAIL_USER}>\nReply-To: ${senderEmail}\nContent-Type: text/html; charset=UTF-8\n\n${composedHtml}`
  ).toString('base64url');
  await gmail.users.messages.send({ userId: GMAIL_USER, requestBody: { raw } });
}

async function markAsRead(gmail, id) {
  await gmail.users.messages.modify({ userId: GMAIL_USER, id, requestBody: { removeLabelIds: ['UNREAD'] } });
}

// ========= Main =========
async function main() {
  const gmail = await getGmail();
  const messages = await listUnreadMessages(gmail);
  if (!messages.length) {
    console.log('No unread messages.');
    return;
  }
  const execRecipients = await getExecRecipients();

  for (const meta of messages) {
    try {
      const msg = await getFullMessage(gmail, meta.id);
      const from = getHeader(msg, 'From');
      const subject = getHeader(msg, 'Subject');
      const body = extractPlainBody(msg);
      const human = isLikelyHuman({ from, subject, body });
      if (!human) {
        console.log(`Skip bot/system message: ${meta.id}`);
        await markAsRead(gmail, meta.id);
        continue;
      }
      await sendAutoReply(gmail, msg);
      await forwardToExecs(gmail, msg, execRecipients);
      await markAsRead(gmail, meta.id);
      console.log(`Processed message: ${meta.id}`);
    } catch (err) {
      console.error('Error processing message', meta.id, err);
    }
  }
}

// Allow a listing run without sending (optional flags)
if (process.env.LIST_EXEC_RECIPIENTS === '1') {
  (async () => {
    const list = await getExecRecipients();
    console.log(JSON.stringify(list, null, 2));
  })();
} else {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}


