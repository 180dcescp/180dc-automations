#!/usr/bin/env node

/**
 * Slack Usergroups Sync
 * 
 * Migrated from Google Apps Script to GitHub Actions
 * Syncs Google Sheets member data with Slack usergroups
 * 
 * Features:
 * - Auto-managed project usergroups from Projects column
 * - Auto-managed campus usergroups from Campus column
 * - Fixed department and role-based groups
 * - Alumni handling (only in @alumni group)
 * - Rate limiting and batched operations
 */

import { WebClient } from '@slack/web-api';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

class SlackUsergroupsSync {
  constructor() {
    // Validate required environment variables
    this.validateEnvironment();
    
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.sheets = null;
    this.sheetsId = this.extractSheetId(process.env.GSHEET_MEMBERS_LINK);
    this.dryRun = process.env.DRY_RUN === 'true';
    
    // Configuration matching the original Google Apps Script
    this.config = {
      SHEET_NAME: 'Member Database',
      GROUP_PREFIX: '',
      
      // Column headers
      COL_EMAIL: 'Email 180',
      COL_DEPT: 'Department',
      COL_POSITION: 'Position',
      COL_STATUS: 'Status',
      COL_PROJECTS: 'Projects',
      COL_CAMPUS: 'Campus',
      
      // Fixed Slack handles (only truly fixed groups)
      HANDLE_ACTIVE: 'actives',
      HANDLE_ALUMNI: 'alumni',
      HANDLE_PVP: 'p-vp',
      HANDLE_PL: 'project-leaders',
      HANDLE_LEADERSHIP: 'leadership',

      // Settings
      MANAGE_LEADERSHIP: true,
      DEPT_ONLY_ACTIVE: true,
      MANAGE_PROJECT_GROUPS: true,
      PROJECTS_REQUIRE_ACTIVE: true,
      MANAGE_CAMPUS_GROUPS: true,
      CAMPUS_REQUIRE_ACTIVE: true,
      
      // Rate limiting
      LOOKUP_BATCH_SIZE: 40,
      LOOKUP_SPACING_MS: 300,
      BATCH_PAUSE_MS: 1500,
      MAX_RETRIES: 5,
      BASE_BACKOFF_MS: 1500
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
        projects: getColumnIndex(this.config.COL_PROJECTS),
        campus: getColumnIndex(this.config.COL_CAMPUS)
      };

      console.log('📋 Column mapping:', columnIndices);

      // Transform rows to member objects with validation
      const members = dataRows.map((row, index) => {
        const email = this.normalizeEmail(row[columnIndices.email]);
        const member = {
          email,
          dept: (row[columnIndices.dept] || '').toString().trim(),
          position: (row[columnIndices.position] || '').toString().trim(),
          status: (row[columnIndices.status] || '').toString().trim(),
          projects: (row[columnIndices.projects] || '').toString().trim(),
          campus: (row[columnIndices.campus] || '').toString().trim(),
          rowIndex: index + 2 // +2 because we skipped header and arrays are 0-indexed
        };
        
        // Validate email format
        if (email && !this.isValidEmail(email)) {
          console.warn(`⚠️ Invalid email format in row ${member.rowIndex}: ${email}`);
        }
        
        return member;
      }).filter(member => member.email); // Only include members with email

      console.log(`📊 Loaded ${members.length} members from sheet`);
      return members;
    } catch (error) {
      console.error('❌ Error reading members from sheet:', error);
      throw error;
    }
  }

  /**
   * Build target memberships for all usergroups
   */
  buildTargets(members) {
    const groupsByHandle = {};
    const ensure = (handle) => {
      if (!groupsByHandle[handle]) {
        groupsByHandle[handle] = new Set();
      }
      return groupsByHandle[handle];
    };

    // Initialize only truly fixed handles (role-based, not department-based)
    const fixedHandles = [
      this.config.HANDLE_ACTIVE, this.config.HANDLE_ALUMNI,
      this.config.HANDLE_PVP, this.config.HANDLE_PL, this.config.HANDLE_LEADERSHIP
    ];

    fixedHandles.forEach(handle => ensure(this.slugWithPrefix(handle)));

    const actives = new Set();
    const others = new Set();

    for (const member of members) {
      const { email, dept, position, status, projects, campus } = member;

      if (status.toLowerCase() === 'alumni') {
        // Alumni rule: ONLY in @alumni; excluded from all other groups
        ensure(this.slugWithPrefix(this.config.HANDLE_ALUMNI)).add(email);
        others.add(email);
        continue;
      }

      // Active users
      actives.add(email);
      ensure(this.slugWithPrefix(this.config.HANDLE_ACTIVE)).add(email);

      // Dynamic department groups (derived from sheet data)
      if (!this.config.DEPT_ONLY_ACTIVE || status.toLowerCase() === 'active') {
        if (dept) {
          const deptHandle = this.slugWithPrefix(this.slugify(dept));
          ensure(deptHandle).add(email);
        }
      }

      // Roles (actives only)
      if (position === 'Project Leader') ensure(this.slugWithPrefix(this.config.HANDLE_PL)).add(email);
      if (dept === 'Presidency' || position === 'President' || position === 'Vice-President') {
        ensure(this.slugWithPrefix(this.config.HANDLE_PVP)).add(email);
      }

      if (this.config.MANAGE_LEADERSHIP) {
        const isLeadership = dept === 'Presidency' || position === 'President' ||
                            position === 'Vice-President' || position.startsWith('Head of') ||
                            position === 'Associate Director';
        if (isLeadership) ensure(this.slugWithPrefix(this.config.HANDLE_LEADERSHIP)).add(email);
      }

      // Dynamic project groups
      if (this.config.MANAGE_PROJECT_GROUPS && (!this.config.PROJECTS_REQUIRE_ACTIVE || status.toLowerCase() === 'active')) {
        if (projects) {
          const projectList = projects.split(', ').map(p => p.trim()).filter(Boolean);
          for (const project of projectList) {
            const handle = this.slugWithPrefix(this.slugify(project));
            ensure(handle).add(email);
          }
        }
      }

      // Dynamic campus groups
      if (this.config.MANAGE_CAMPUS_GROUPS && (!this.config.CAMPUS_REQUIRE_ACTIVE || status.toLowerCase() === 'active')) {
        if (campus) {
          const handle = this.slugWithPrefix(this.slugify(campus));
          ensure(handle).add(email);
        }
      }
    }

    const priorityEmails = [...actives, ...others];
    const summary = Object.fromEntries(
      Object.entries(groupsByHandle).map(([h, set]) => [h, set.size])
    );

    console.log(`📊 Group sizes (pre-resolve): ${JSON.stringify(summary)}`);

    return { groupsByHandle, priorityEmails };
  }

  /**
   * Resolve Slack users by email with batching and rate limiting
   */
  async resolveSlackUsersBatched(groupsByHandle, priorityEmails) {
    const emailToUser = {};
    const needed = new Set();
    
    Object.values(groupsByHandle).forEach(set => {
      set.forEach(email => { if (email) needed.add(email); });
    });

    const otherNeeded = [...needed].filter(email => !priorityEmails.includes(email));
    const ordered = [...priorityEmails.filter(email => needed.has(email)), ...otherNeeded];

    console.log(`🔍 Will resolve ${ordered.length} emails (actives prioritized)`);

    const batchSize = this.config.LOOKUP_BATCH_SIZE;
    
    for (let i = 0; i < ordered.length; i += batchSize) {
      const batch = ordered.slice(i, i + batchSize);
      console.log(`🔍 Resolving batch ${Math.floor(i / batchSize) + 1}: ${batch.length} users`);
      
      for (const email of batch) {
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
      
      await this.sleep(this.config.BATCH_PAUSE_MS);
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
          return { id: result.user.id, deleted: !!(result.user.deleted) };
        } else {
          if (result.error !== 'users_not_found') {
            console.warn(`⚠️ Lookup error for ${email}: ${result.error}`);
          } else {
            console.warn(`⚠️ Could not resolve Slack ID for ${email}: users_not_found`);
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
        
        // Handle other API errors
        if (error.data && error.data.error) {
          console.warn(`⚠️ Slack API error for ${email}: ${error.data.error}`);
          if (error.data.error === 'invalid_auth' || error.data.error === 'account_inactive') {
            throw new Error(`Slack authentication failed: ${error.data.error}`);
          }
        }
        
        console.warn(`⚠️ Lookup error for ${email}:`, error.message);
        return null;
      }
    }
    
    console.warn(`⚠️ Max retries hit for ${email}; giving up this run`);
    return null;
  }

  /**
   * List all usergroups (including disabled)
   */
  async listAllUsergroups() {
    try {
      const result = await this.slack.usergroups.list({ include_disabled: true });
      const map = {};
      
      if (result.ok && Array.isArray(result.usergroups)) {
        result.usergroups.forEach(ug => {
          if (ug && ug.handle && ug.id) {
            map[ug.handle] = { id: ug.id, date_delete: ug.date_delete || 0 };
          }
        });
      }
      
      return map;
    } catch (error) {
      console.error('❌ Error listing usergroups:', error);
      return {};
    }
  }

  /**
   * Enable usergroup
   */
  async enableUsergroup(id) {
    try {
      const result = await this.slack.usergroups.enable({ usergroup: id });
      if (!result.ok && result.error !== 'already_enabled') {
        console.warn(`⚠️ Enable failed for ${id}: ${result.error}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error enabling usergroup ${id}:`, error.message);
    }
  }

  /**
   * Disable usergroup
   */
  async disableUsergroup(id) {
    try {
      const result = await this.slack.usergroups.disable({ usergroup: id });
      if (!result.ok && result.error !== 'already_disabled') {
        console.warn(`⚠️ Disable failed for ${id}: ${result.error}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error disabling usergroup ${id}:`, error.message);
    }
  }

  /**
   * Ensure all desired usergroups exist
   */
  async ensureUsergroups(handles) {
    const existing = await this.listAllUsergroups();
    const handleToId = {};
    
    for (const handle of handles) {
      if (existing[handle]?.id) {
        handleToId[handle] = existing[handle].id;
        // If disabled, enable it
        if (existing[handle].date_delete && existing[handle].date_delete > 0) {
          await this.enableUsergroup(existing[handle].id);
        }
        continue;
      }
      
      // Create new usergroup
      const name = this.handleToDisplayName(handle);
      try {
        const result = await this.slack.usergroups.create({
          name: name,
          handle: handle
        });
        
        if (result.ok) {
          handleToId[handle] = result.usergroup.id;
          console.log(`✅ Created usergroup: ${handle}`);
        } else {
          console.warn(`⚠️ Failed to create usergroup ${handle}: ${result.error}`);
        }
      } catch (error) {
        if (error.data && error.data.error === 'name_already_exists') {
          console.warn(`⚠️ Usergroup ${handle} already exists (name conflict). Proceeding.`);
        } else {
          console.warn(`⚠️ Failed to create usergroup ${handle}:`, error.message);
        }
      }
      
      await this.sleep(200);
    }
    
    return handleToId;
  }

  /**
   * Update usergroup memberships
   */
  async updateUsergroupMembers(handle, userIds) {
    if (userIds.length === 0) {
      console.log(`⏭️ Skipping empty usergroup: ${handle}`);
      return;
    }

    try {
      const result = await this.slack.usergroups.users.update({
        usergroup: handle,
        users: userIds.join(',')
      });
      
      if (result.ok) {
        console.log(`✅ Updated ${handle}: ${userIds.length} members`);
      } else {
        console.warn(`⚠️ Failed to update ${handle}: ${result.error}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error updating ${handle}:`, error.message);
    }
  }

  /**
   * Main sync function
   */
  async sync() {
    console.log('🚀 Starting Slack Usergroups Sync...\n');
    
    try {
      // Initialize Google Sheets
      await this.initializeSheets();
      
      // Read member data
      const members = await this.readMembers();
      console.log(`📊 Loaded ${members.length} members from sheet`);
      
      // Build targets
      const { groupsByHandle, priorityEmails } = this.buildTargets(members);
      
      if (this.dryRun) {
        console.log('🧪 DRY RUN MODE - No changes will be made');
        console.log('📊 Would update groups:', Object.keys(groupsByHandle));
        return;
      }
      
      // Resolve Slack users
      const emailToUser = await this.resolveSlackUsersBatched(groupsByHandle, priorityEmails);
      
      // Ensure all desired usergroups exist
      const desiredHandles = Object.keys(groupsByHandle);
      const handleToId = await this.ensureUsergroups(desiredHandles);
      
      // Disable usergroups that are empty or only contain alumni
      const existing = await this.listAllUsergroups();
      const alumniHandle = this.slugWithPrefix(this.config.HANDLE_ALUMNI);

      // Find usergroups to disable: those with no active members (empty or alumni-only)
      const toDisable = [];
      for (const [handle, info] of Object.entries(existing)) {
        // Skip if already disabled
        if (info.date_delete && info.date_delete > 0) continue;

        // Check if this group has any non-alumni members
        const groupEmails = groupsByHandle[handle] ? [...groupsByHandle[handle]] : [];
        const hasActiveMembers = groupEmails.some(email => {
          const user = emailToUser[email];
          return user && user.id;
        });

        // If the group is empty or the handle is not in our desired groups, disable it
        // Exception: don't disable @alumni if it has members
        if (handle === alumniHandle) continue;

        if (!hasActiveMembers || !desiredHandles.includes(handle)) {
          toDisable.push(handle);
        }
      }

      if (toDisable.length > 0) {
        console.log(`🗑️ Disabling ${toDisable.length} empty/inactive usergroups`);
        for (const handle of toDisable) {
          const id = existing[handle]?.id;
          if (id) {
            console.log(`  - Disabling: ${handle}`);
            await this.disableUsergroup(id);
            await this.sleep(150);
          }
        }
      }
      
      // Update memberships
      const orderedHandles = [
        this.slugWithPrefix(this.config.HANDLE_ACTIVE),
        ...desiredHandles.filter(h => h !== this.slugWithPrefix(this.config.HANDLE_ACTIVE))
      ];
      
      for (const handle of orderedHandles) {
        const ugId = handleToId[handle];
        if (!ugId) {
          console.warn(`⚠️ Missing usergroup ID for ${handle}`);
          continue;
        }
        
        const emails = [...(groupsByHandle[handle] || new Set())];
        const userIds = emails
          .map(email => emailToUser[email]?.id)
          .filter(Boolean);
        
        await this.updateUsergroupMembers(ugId, userIds);
        await this.sleep(250);
      }
      
      console.log(`\n🎉 Sync completed successfully!`);
      console.log(`📊 Updated ${orderedHandles.length} usergroups`);
      
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

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  slugify(str) {
    return String(str).trim().toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80);
  }

  slugWithPrefix(s) {
    return (this.config.GROUP_PREFIX + this.slugify(s))
      .replace(/--+/g, '-')
      .replace(/^-+/, '');
  }

  handleToDisplayName(handle) {
    const pref = this.config.GROUP_PREFIX;
    const noPref = (pref && handle.startsWith(pref)) ? handle.slice(pref.length) : handle;
    return noPref.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const sync = new SlackUsergroupsSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('slack-usergroups-sync.js')) {
  main();
}

export default SlackUsergroupsSync;
