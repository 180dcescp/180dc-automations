// gmail.ts
// Handles Gmail API operations for Cloudflare Worker
// ENV VARS required:
// - GMAIL_CLIENT_ID
// - GMAIL_CLIENT_EMAIL
// - GMAIL_PRIVATE_KEY
// - GMAIL_SCOPES (defaults: ["https://www.googleapis.com/auth/gmail.modify"])
// - GMAIL_USER (the mailbox being processed, e.g., escp@180dc.org)
// - GMAIL_REFRESH_TOKEN (if using OAuth2 for individual mailbox access)
//
// All secrets should be defined in wrangler.toml and Cloudflare dashboard.

import { google } from "googleapis";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

export async function getGmailClient(env: Record<string, string>) {
  // In Worker environment (no Node.js), service account can only access user mail if domain-wide delegation is enabled.
  // Otherwise, use OAuth2 (refresh token flow) for per-user access. We assume env vars provided.
  if (env.GMAIL_CLIENT_EMAIL && env.GMAIL_PRIVATE_KEY && env.GMAIL_USER) {
    const jwt = new google.auth.JWT(
      env.GMAIL_CLIENT_EMAIL,
      undefined,
      env.GMAIL_PRIVATE_KEY.replace(/\\n/g, "\n"),
      GMAIL_SCOPES,
      env.GMAIL_USER // delegated user
    );
    await jwt.authorize();
    return google.gmail({ version: "v1", auth: jwt });
  }
  // Example: OAuth2 alternative
  // else if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
  //   const oAuth2Client = new google.auth.OAuth2(
  //     env.GMAIL_CLIENT_ID,
  //     env.GMAIL_CLIENT_SECRET
  //   );
  //   oAuth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  //   return google.gmail({ version: "v1", auth: oAuth2Client });
  // }
  throw new Error("No valid Gmail credentials found in environment");
}

export async function listRecentMessages(gmail: any, user: string, query = '', maxResults = 10) {
  // List recent messages for a user, optionally with Gmail queries
  const res = await gmail.users.messages.list({
    userId: user,
    q: query,
    maxResults,
  });
  return res.data.messages || [];
}

export async function getMessage(gmail: any, user: string, messageId: string) {
  // Fetch the full email content for a message
  const res = await gmail.users.messages.get({
    userId: user,
    id: messageId,
    format: 'full'
  });
  return res.data;
}

export async function sendEmail(gmail: any, user: string, raw: string) {
  // Send a raw email (RFC822 base64)
  return gmail.users.messages.send({
    userId: user,
    requestBody: { raw },
  });
}

export async function sendReply({ gmail, user, threadId, raw }: { gmail: any, user: string, threadId: string, raw: string }) {
  // Send a reply-to message
  return gmail.users.messages.send({
    userId: user,
    requestBody: {
      raw,
      threadId,
    },
  });
}
