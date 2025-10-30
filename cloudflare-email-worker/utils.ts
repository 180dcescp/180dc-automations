// utils.ts
import { simpleParser, ParsedMail } from 'mailparser';

// Heuristics for machine-generated emails (add to as needed)
const KNOWN_BOT_HEADERS = [
  /mailer-daemon/i,
  /noreply/i,
  /no-reply/i,
  /do-not-reply/i,
  /automated/i,
  /notification/i,
  /bot@/i,
];

const KNOWN_BOT_DOMAINS = [
  /@facebookmail\./i,
  /@amazon\./i,
  /@google\./i,
  /@slack\./i,
  /@notify/i,
  /@alerts?/i,
  /@mailgun\./i,
  /@sendgrid\./i,
];

export async function isLikelyHumanEmail(rawEmail: string): Promise<boolean> {
  const mail: ParsedMail = await simpleParser(rawEmail);

  // Check common bot From addresses/domains
  const sender = mail.from?.value[0]?.address || '';
  if (
    KNOWN_BOT_HEADERS.some(r => r.test(sender)) ||
    KNOWN_BOT_DOMAINS.some(r => r.test(sender))
  ) return false;

  // Check for presence of common humanish info
  const maybePersonal = (
    !!mail.text && mail.text.length > 30 &&
    !/unsubscribe|privacy|notification|automated/i.test(mail.text)
  );
  if (maybePersonal) return true;

  // Many bots have no real display name
  if (mail.from?.value[0]?.name && mail.from.value[0].name.length > 5) return true;

  // Check subject for classic bot words
  const subject = mail.subject || '';
  if (/auto.?reply|receipt|password|otp|verify|code|notification|alert/i.test(subject)) return false;

  // Default: fall back to human
  return true;
}
