// memberSheet.ts
// Fetches the list of executive emails via Google Sheets API
// ENV required:
// - GSHEET_PROJECT_ID
// - GSHEET_CLIENT_EMAIL
// - GSHEET_PRIVATE_KEY
// - GSHEET_SHEET_ID
// - GSHEET_EMAIL_RANGE (e.g. "Execs!A:D")
//
// Adapted from Slack channel sync logic
import { google } from 'googleapis';

export interface ExecMember {
  email: string;
  fullName: string;
  position: string;
  department: string;
}

export async function getExecutiveEmails(env: Record<string, string>): Promise<ExecMember[]> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: env.GSHEET_PROJECT_ID,
      private_key: env.GSHEET_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: env.GSHEET_CLIENT_EMAIL,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GSHEET_SHEET_ID,
    range: env.GSHEET_EMAIL_RANGE || 'Execs!A:Z',
  });
  const data = response.data.values;
  if (!data || data.length < 2) return [];
  const headers = data[0].map((h: string) => h.toLowerCase());
  const idx = {
    email: headers.findIndex((h) => h.includes('email')),
    fullName: headers.findIndex((h) => h.includes('full name')),
    position: headers.findIndex((h) => h.includes('position')),
    department: headers.findIndex((h) => h.includes('department')),
    status: headers.findIndex((h) => h.includes('status')),
  };
  return data.slice(1)
    .map((row: string[]) => ({
      email: row[idx.email]?.trim() || '',
      fullName: row[idx.fullName]?.trim() || '',
      position: row[idx.position]?.trim() || '',
      department: row[idx.department]?.trim() || '',
      status: row[idx.status]?.trim() || '',
    }))
    .filter((x) => x.email && x.status.toLowerCase() === 'active' && x.department.toLowerCase() !== 'consultants');
}
