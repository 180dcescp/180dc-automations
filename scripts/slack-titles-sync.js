#!/usr/bin/env node

/**
 * Slack Titles Sync
 * 
 * Migrated from Google Apps Script to GitHub Actions
 * Updates Slack user profile titles based on Google Sheets data
 * 
 * Features:
 * - Only-if-different updates (checks current titles first)
 * - Projects suffix support
 * - Alumni handling
 * - Rate limiting and batching
 * - Email notifications for missing positions
 */

import { WebClient } from '@slack/web-api';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

class SlackTitlesSync {
  constructor() {
    // Validate required environment variables
    this.validateEnvironment();
    
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.sheets = null;
    this.sheetsId = this.extractSheetId(process.env.GSHEET_MEMBERS_LINK);
    this.dryRun = process.env.DRY_RUN === 'true';
    
    // Notifications: use logs (or Slack via workflow) instead of email
    
    // Configuration matching the original Google Apps Script
    this.config = {
      SHEET_NAME: 'Member Database',
      
      // Column headers
      COL_EMAIL: 'Email 180',
      COL_DEPT: 'Department',
      COL_POSITION: 'Position',
      COL_STATUS: 'Status',
      COL_PROJECTS: 'Projects',
      
      // Rate limiting
      LOOKUP_BATCH_SIZE: 50,
      LOOKUP_SPACING_MS: 200,
      LOOKUP_BATCH_PAUSE_MS: 1000,
      TITLES_BATCH_SIZE: 60,
      TITLES_SPACING_MS: 150,
      TITLES_BATCH_PAUSE_MS: 1200,
      VERIFY_PRECHECK_BATCH_SIZE: 80,
      VERIFY_PRECHECK_SPACING_MS: 120,
      VERIFY_PRECHECK_BATCH_PAUSE_MS: 1000,
      MAX_RETRIES: 5,
      BASE_BACKOFF_MS: 1500,
      LOG_EVERY_N_UPDATES: 10
    };
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const required = [
      'SLACK_BOT_TOKEN',
      'GSHEET_MEMBERS_LINK',
      'GOOGLE_PROJECT_ID',
      'GOOGLE_PRIVATE_KEY_ID',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_CLIENT_ID'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Extract sheet ID from Google Sheets URL
   */
  extractSheetId(url) {
    if (!url) {
      throw new Error('GSHEET_MEMBERS_LINK environment variable is required');
    }
    
    // Extract sheet ID from various Google Sheets URL formats
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,  // Standard format
      /\/d\/([a-zA-Z0-9-_]+)/,                // Short format
      /id=([a-zA-Z0-9-_]+)/                   // Alternative format
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    throw new Error(`Could not extract sheet ID from URL: ${url}`);
  }

  /**
   * Initialize Google Sheets API
   */
  async initializeSheets() {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          type: 'service_account',
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL}`
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('✅ Google Sheets API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets API:', error);
      throw error;
    }
  }

  /**
   * Read member data from Google Sheets
   */
  async readMembers() {
    try {
      console.log(`📊 Reading member data from sheet: ${this.config.SHEET_NAME}`);
      
      // First, get the spreadsheet metadata to find the correct sheet name
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetsId
      });
      
      const sheets = spreadsheet.data.sheets || [];
      console.log(`📋 Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
      
      // Find the sheet that matches our target name (case-insensitive)
      const targetSheet = sheets.find(sheet => 
        sheet.properties?.title?.toLowerCase() === this.config.SHEET_NAME.toLowerCase()
      );
      
      if (!targetSheet) {
        throw new Error(`Sheet "${this.config.SHEET_NAME}" not found. Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
      }
      
      const actualSheetName = targetSheet.properties.title;
      console.log(`📊 Using sheet: "${actualSheetName}"`);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetsId,
        range: `${actualSheetName}!A:Z`
      });

      const values = response.data.values;
      if (!values || values.length < 2) {
        throw new Error('No data found in sheet');
      }

      const headers = values[0];
      const dataRows = values.slice(1);
      
      // Find column indices
      const getColumnIndex = (columnName) => {
        return headers.findIndex(header => 
          header && header.toString().toLowerCase().includes(columnName.toLowerCase())
        );
      };

      const columnIndices = {
        email: getColumnIndex(this.config.COL_EMAIL),
        dept: getColumnIndex(this.config.COL_DEPT),
        position: getColumnIndex(this.config.COL_POSITION),
        status: getColumnIndex(this.config.COL_STATUS),
        projects: getColumnIndex(this.config.COL_PROJECTS)
      };

      console.log('📋 Column mapping:', columnIndices);

      // Transform rows to member objects
      const members = dataRows.map((row, index) => ({
        email: this.normalizeEmail(row[columnIndices.email]),
        dept: row[columnIndices.dept] || '',
        position: row[columnIndices.position] || '',
        status: row[columnIndices.status] || '',
        projects: row[columnIndices.projects] || '',
        rowIndex: index + 2 // +2 because we skipped header and arrays are 0-indexed
      })).filter(member => member.email); // Only include members with email

      console.log(`📊 Loaded ${members.length} members from sheet`);
      return members;
    } catch (error) {
      console.error('❌ Error reading members from sheet:', error);
      throw error;
    }
  }

  /**
   * Compute intended titles for all members
   */
  computeIntendedTitles(members) {
    const userTitleMap = {};
    const missingPositionActives = [];
    const actives = new Set();
    const others = new Set();

    for (const member of members) {
      const { email, dept, position, status, projects } = member;
      
      if (status.toLowerCase() === 'alumni') {
        // Alumni with empty position -> base "Alumni", still append projects
        if (!position) {
          const base = 'Alumni';
          userTitleMap[email] = base + this.formatProjectsSuffix(projects);
        } else {
          const title = this.buildProfileTitle(position, dept, status);
          if (title) {
            userTitleMap[email] = title + this.formatProjectsSuffix(projects);
          }
        }
        others.add(email);
        continue;
      }

      // Active users
      if (!position) {
        // Leave behavior untouched: we still do NOT set a title,
        // but we record for the notification email
        missingPositionActives.push({ email, dept });
        others.add(email);
        continue;
      }

      const title = this.buildProfileTitle(position, dept, status);
      if (title) {
        userTitleMap[email] = title + this.formatProjectsSuffix(projects);
      }
      actives.add(email);
    }

    const orderedEmails = [...actives, ...others]; // prioritize actives
    console.log(`📊 Prepared ${Object.keys(userTitleMap).length} intended titles`);
    console.log(`📊 Actives with missing position: ${missingPositionActives.length}`);
    
    return { userTitleMap, orderedEmails, missingPositionActives };
  }

  /**
   * Resolve Slack users by email with batching and rate limiting
   */
  async resolveSlackUsersForTitles(emailsOrdered) {
    const emailToUser = {};
    const batchSize = this.config.LOOKUP_BATCH_SIZE;
    
    for (let i = 0; i < emailsOrdered.length; i += batchSize) {
      const batch = emailsOrdered.slice(i, i + batchSize);
      console.log(`🔍 Resolving batch ${Math.floor(i / batchSize) + 1}: ${batch.length} users`);
      
      for (const email of batch) {
        if (!email) continue;
        
        try {
          const user = await this.lookupUserByEmailWithRetry(email);
          if (user && user.id) {
            emailToUser[email] = user;
          }
        } catch (error) {
          console.warn(`⚠️ Failed to lookup user ${email}:`, error.message);
        }
        
        await this.sleep(this.config.LOOKUP_SPACING_MS);
      }
      
      await this.sleep(this.config.LOOKUP_BATCH_PAUSE_MS);
    }
    
    return emailToUser;
  }

  /**
   * Lookup user by email with retry logic
   */
  async lookupUserByEmailWithRetry(email) {
    let attempt = 0;
    
    while (attempt <= this.config.MAX_RETRIES) {
      try {
        const result = await this.slack.users.lookupByEmail({ email });
        
        if (result.ok && result.user && result.user.id) {
          const name = this.extractUserName(result.user);
          return { 
            id: result.user.id, 
            deleted: !!(result.user.deleted), 
            name: name 
          };
        } else {
          if (result.error !== 'users_not_found') {
            console.warn(`⚠️ Lookup error for ${email}: ${result.error}`);
          } else {
            console.warn(`⚠️ Could not resolve Slack ID (users_not_found): ${email}`);
          }
          return null;
        }
      } catch (error) {
        if (error.data && error.data.error === 'ratelimited') {
          const retryAfter = error.data.retry_after || this.config.BASE_BACKOFF_MS;
          const waitMs = retryAfter * 1000 * Math.pow(2, attempt);
          console.warn(`⏳ Rate limited on users.lookupByEmail for ${email}. Waiting ${waitMs}ms (attempt ${attempt + 1})`);
          await this.sleep(waitMs);
          attempt++;
          continue;
        }
        
        console.warn(`⚠️ Lookup error for ${email}:`, error.message);
        return null;
      }
    }
    
    console.warn(`⚠️ Max retries hit for ${email}; giving up this run`);
    return null;
  }

  /**
   * Fetch current titles for users (only-if-different check)
   */
  async fetchCurrentTitlesBatched(userIds) {
    const currentTitleByUserId = {};
    const batchSize = this.config.VERIFY_PRECHECK_BATCH_SIZE;
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      for (const userId of batch) {
        try {
          const currentTitle = await this.fetchCurrentTitle(userId);
          currentTitleByUserId[userId] = currentTitle;
        } catch (error) {
          console.warn(`⚠️ Failed to fetch current title for ${userId}:`, error.message);
          currentTitleByUserId[userId] = '';
        }
        
        await this.sleep(this.config.VERIFY_PRECHECK_SPACING_MS);
      }
      
      await this.sleep(this.config.VERIFY_PRECHECK_BATCH_PAUSE_MS);
    }
    
    return currentTitleByUserId;
  }

  /**
   * Fetch current title for a single user
   */
  async fetchCurrentTitle(userId) {
    try {
      const result = await this.slack.users.info({ user: userId });
      if (result.ok && result.user && result.user.profile) {
        return String((result.user.profile.title || '')).trim();
      }
    } catch (error) {
      console.warn(`⚠️ users.info failed for ${userId}:`, error.message);
    }
    return '';
  }

  /**
   * Set user title with retry logic
   */
  async setUserTitleWithRetry(userId, title) {
    let attempt = 0;
    
    while (attempt <= this.config.MAX_RETRIES) {
      try {
        const result = await this.slack.users.profile.set({
          user: userId,
          profile: { title: title }
        });
        
        if (result.ok) {
          return true;
        }
        
        const hard = new Set([
          'not_allowed_token_type', 'missing_scope', 'cant_update_user', 
          'invalid_user', 'account_inactive', 'cannot_update_admin_user'
        ]);
        
        if (hard.has(result.error)) {
          console.warn(`⚠️ Title update refused for ${userId}: ${result.error}`);
          return false;
        }
        
        console.warn(`⚠️ Title update failed for ${userId}: ${result.error}`);
        return false;
      } catch (error) {
        if (error.data && error.data.error === 'ratelimited') {
          const retryAfter = error.data.retry_after || this.config.BASE_BACKOFF_MS;
          const waitMs = retryAfter * 1000 * Math.pow(2, attempt);
          console.warn(`⏳ Rate limited on users.profile.set for ${userId}. Waiting ${waitMs}ms (attempt ${attempt + 1})`);
          await this.sleep(waitMs);
          attempt++;
          continue;
        }
        
        console.warn(`⚠️ Title update failed for ${userId}:`, error.message);
        return false;
      }
    }
    
    console.warn(`⚠️ Max retries hit for title update ${userId}; giving up this run`);
    return false;
  }

  /**
   * Send email notification for missing positions
   */
  async notifyMissingPositionActives(missingList) {
    if (!missingList || missingList.length === 0) return;
    const lines = missingList
      .slice(0, 25)
      .map((x, i) => `${i + 1}. ${x.email}${x.dept ? ` — Dept: ${x.dept}` : ''}`)
      .join(', ');
    console.log(`⚠️ ${missingList.length} active member(s) missing Position. Sample: ${lines}`);
  }

  /**
   * Main sync function
   */
  async sync() {
    console.log('🚀 Starting Slack Titles Sync...\n');
    
    try {
      // Initialize Google Sheets
      await this.initializeSheets();
      
      // Read member data
      const members = await this.readMembers();
      console.log(`📊 Loaded ${members.length} members from sheet`);
      
      // Compute intended titles
      const { userTitleMap, orderedEmails, missingPositionActives } = this.computeIntendedTitles(members);
      
      if (Object.keys(userTitleMap).length === 0) {
        console.log('📊 No titles to update (no positions found and no alumni defaults)');
        if (missingPositionActives.length > 0) {
          await this.notifyMissingPositionActives(missingPositionActives);
        }
        return;
      }
      
      // Resolve Slack users
      const emailToUser = await this.resolveSlackUsersForTitles(orderedEmails);
      
      // Build entries, skip unresolved
      const entries = Object.entries(userTitleMap)
        .map(([email, title]) => ({ email, title, user: emailToUser[email] }))
        .filter(e => e.user && e.user.id);
      
      // Exclude deactivated users
      const activeEntries = entries.filter(e => !e.user.deleted);
      
      const numResolved = Object.values(emailToUser).filter(Boolean).length;
      const unresolvedEmails = orderedEmails.filter(e => !emailToUser[e]);
      const deactivated = entries.length - activeEntries.length;
      
      console.log(`📊 Prepared ${Object.keys(userTitleMap).length} intended titles`);
      console.log(`📊 Actives with missing position: ${missingPositionActives.length}`);
      if (missingPositionActives.length > 0) {
        await this.notifyMissingPositionActives(missingPositionActives);
      }
      console.log(`📊 Resolved: ${numResolved}, Unresolved: ${unresolvedEmails.length}, Deactivated: ${deactivated}`);
      
      if (unresolvedEmails.length > 0) {
        console.log('⚠️ Unresolved emails (users_not_found): ' + 
          JSON.stringify(unresolvedEmails.slice(0, 25)) + 
          (unresolvedEmails.length > 25 ? ' ...' : ''));
      }
      
      if (this.dryRun) {
        console.log('🧪 DRY RUN MODE - No changes will be made');
        console.log('📊 Would update titles for:', activeEntries.length, 'users');
        return;
      }
      
      // Only-if-different: fetch current titles first
      const currentTitleByUserId = await this.fetchCurrentTitlesBatched(
        activeEntries.map(e => e.user.id)
      );
      
      const toUpdate = activeEntries.filter(e => {
        const current = (currentTitleByUserId[e.user.id] || '').trim();
        const intended = (e.title || '').trim();
        return current !== intended;
      });
      
      const skipped = activeEntries.length - toUpdate.length;
      console.log(`📊 ONLY-IF-DIFFERENT: ${skipped} already matched; will update ${toUpdate.length} users`);
      
      if (toUpdate.length === 0) {
        console.log('📊 Nothing to update — all titles already match');
        return;
      }
      
      console.log(`📊 Updating titles for ${toUpdate.length} users`);
      
      const failures = [];
      const successes = [];
      const batchSize = this.config.TITLES_BATCH_SIZE;
      
      let processed = 0;
      for (let i = 0; i < toUpdate.length; i += batchSize) {
        const batch = toUpdate.slice(i, i + batchSize);
        
        for (const { email, title, user } of batch) {
          const name = this.safeName(user);
          console.log(`→ Setting title for ${name} <${email}> (${user.id}) -> "${this.truncate(title)}"`);
          
          const ok = await this.setUserTitleWithRetry(user.id, title);
          
          if (ok) {
            successes.push({ email, userId: user.id, name, title });
            processed++;
            if (processed % this.config.LOG_EVERY_N_UPDATES === 0) {
              console.log(`📊 Progress: ${processed}/${toUpdate.length} titles updated...`);
            }
          } else {
            failures.push({ email, userId: user.id, name, title, error: 'set_failed' });
            console.warn(`❌ FAILED: ${name} <${email}> (${user.id}) -> "${this.truncate(title)}"`);
          }
          
          await this.sleep(this.config.TITLES_SPACING_MS);
        }
        
        await this.sleep(this.config.TITLES_BATCH_PAUSE_MS);
      }
      
      // Summary
      console.log(`\n🎉 Title updates complete!`);
      console.log(`✅ Successes: ${successes.length}, ❌ Failures: ${failures.length}`);
      
      if (failures.length > 0) {
        console.log('📊 Sample failures:', JSON.stringify(failures.slice(0, 5), null, 2));
      }
      
      const preview = successes.slice(0, 10).map(s => ({
        name: s.name, email: s.email, userId: s.userId, title: s.title
      }));
      if (preview.length > 0) {
        console.log('📊 Sample successes:', JSON.stringify(preview, null, 2));
      }
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
      throw error;
    }
  }

  /**
   * Utility functions
   */
  normalizeEmail(value) {
    const s = String(value || '').trim().toLowerCase();
    if (!s || !/@/.test(s)) return '';
    return s;
  }

  extractUserName(user) {
    const prof = user.profile || {};
    return String(prof.real_name || prof.display_name || user.real_name || user.name || '').trim();
  }

  safeName(userObj) {
    return (userObj && userObj.name) ? userObj.name : '(unknown)';
  }

  truncate(s, n = 120) {
    const str = String(s || '');
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  toTitleCase(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
  }

  normalizeDeptForTitle(dept) {
    const clean = String(dept || '').replace(/^[-–—\s]+/, '').trim();
    if (!clean) return '';
    if (/^p&o$/i.test(clean)) return 'P&O';
    if (/^pvp$|^p-vp$/i.test(clean)) return 'P-VP';
    return this.toTitleCase(clean);
  }

  buildProfileTitle(position, dept, status) {
    const pos = String(position || '').trim();
    if (!pos) return '';
    
    const isAlumni = String(status || '').toLowerCase() === 'alumni';
    const deptClean = this.normalizeDeptForTitle(dept);
    const shouldAppendDept = deptClean && 
      !/^consultants$/i.test(deptClean) && 
      !/^presidency$/i.test(deptClean);
    const suffix = shouldAppendDept ? ` - ${deptClean}` : '';
    const prefix = isAlumni ? 'Alumni ' : '';
    
    return (prefix + pos + suffix).replace(/\s{2,}/g, ' ').trim();
  }

  formatProjectsSuffix(projectsRaw) {
    const raw = String(projectsRaw || '').trim();
    if (!raw) return '';
    
    const seen = new Set();
    const projects = raw.split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0 && !seen.has(p) && (seen.add(p), true));
    
    if (!projects.length) return '';
    return ` (${projects.join(', ')})`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const sync = new SlackTitlesSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('slack-titles-sync.js')) {
  main();
}

export default SlackTitlesSync;
