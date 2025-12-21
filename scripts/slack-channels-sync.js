#!/usr/bin/env node

/**
 * Slack Channels Sync
 * 
 * Syncs Google Sheets member data with Slack channel memberships
 * 
 * Features:
 * - Auto-managed executive channels (Department ≠ "Consultant")
 * - Auto-managed leadership channel (Executives + Project Leaders)
 * - Auto-managed actives channel (Status = "Active")
 * - Always includes escp@180dc.org in all channels
 * - Rate limiting and batched operations
 */

import { WebClient } from '@slack/web-api';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

class SlackChannelsSync {
  constructor() {
    // Validate required environment variables
    this.validateEnvironment();
    
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.sheets = null;
    this.sheetsId = this.extractSheetId(process.env.GSHEET_MEMBERS_LINK);
    this.dryRun = process.env.DRY_RUN === 'true';
    
    // Configuration
    this.config = {
      SHEET_NAME: 'Member Database',
      
      // Column headers
      COL_EMAIL: 'Email 180',
      COL_DEPT: 'Department',
      COL_POSITION: 'Position',
      COL_STATUS: 'Status',
      
      // Always include this email in all channels
      ALWAYS_INCLUDE_EMAIL: 'escp@180dc.org',
      
      // Channel configurations
      CHANNELS: {
        // All executives (Department ≠ "Consultants" AND Status = "Active")
        EXECUTIVE_CHANNELS: [
          'C07CECJ7LTX',
          'G01AJARKC3G',
          'C06KKGWRU10',
          'C08NEBR6N0J',
          'C04H1J4PNLT',
          'C07GVPQ3N9L',
          'C097HQ7576K',
          'C09GZ4UST7E'
        ],
        
        // Department-specific channels
        DEPARTMENT_CHANNELS: {
          // Presidency, Consulting, People & Organisation
          'C097UCTLNHH': ['Presidency', 'Consulting', 'People & Organisation'],
          // Presidency, People & Organisation
          'C07H0G68M4Y': ['Presidency', 'People & Organisation'],
          // Presidency, Business Development, Consulting
          'C08UWD5GV6G': ['Presidency', 'Business Development', 'Consulting']
        },
        
        // Leadership channel (Executives + Project Leaders)
        LEADERSHIP_CHANNEL: 'C07RWMESXRC',
        
        // All actives channel (Status = "Active")
        ACTIVES_CHANNEL: 'C090G37EXJ6'
      },
      
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
        status: getColumnIndex(this.config.COL_STATUS)
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
   * Build target memberships for all channels
   */
  buildTargets(members) {
    const channelMembers = {};
    
    // Initialize all channels
    const allChannels = [
      ...this.config.CHANNELS.EXECUTIVE_CHANNELS,
      ...Object.keys(this.config.CHANNELS.DEPARTMENT_CHANNELS),
      this.config.CHANNELS.LEADERSHIP_CHANNEL,
      this.config.CHANNELS.ACTIVES_CHANNEL
    ];
    
    allChannels.forEach(channelId => {
      channelMembers[channelId] = new Set();
    });

    // Always include escp@180dc.org in all channels
    allChannels.forEach(channelId => {
      channelMembers[channelId].add(this.config.ALWAYS_INCLUDE_EMAIL);
    });

    // Process members
    for (const member of members) {
      const { email, dept, position, status } = member;
      
      // Skip if not active
      if (status.toLowerCase() !== 'active') {
        continue;
      }

      // Executive channels: Department ≠ "Consultants"
      if (dept !== 'Consultants') {
        this.config.CHANNELS.EXECUTIVE_CHANNELS.forEach(channelId => {
          channelMembers[channelId].add(email);
        });
      }

      // Department-specific channels
      Object.entries(this.config.CHANNELS.DEPARTMENT_CHANNELS).forEach(([channelId, allowedDepartments]) => {
        if (allowedDepartments.includes(dept)) {
          channelMembers[channelId].add(email);
        }
      });

      // Leadership channel: Executives + Project Leaders
      if (dept !== 'Consultants' || position === 'Project Leader') {
        channelMembers[this.config.CHANNELS.LEADERSHIP_CHANNEL].add(email);
      }

      // Actives channel: All active members
      channelMembers[this.config.CHANNELS.ACTIVES_CHANNEL].add(email);
    }

    // Convert sets to arrays and log summary
    const summary = {};
    Object.entries(channelMembers).forEach(([channelId, memberSet]) => {
      const members = Array.from(memberSet);
      channelMembers[channelId] = members;
      summary[channelId] = members.length;
    });
    
    console.log(`📊 Channel member counts:`, summary);
    
    return channelMembers;
  }

  /**
   * Resolve Slack users by email with batching and rate limiting
   */
  async resolveSlackUsersBatched(emails) {
    const emailToUser = {};
    
    console.log(`🔍 Will resolve ${emails.length} emails`);

    const batchSize = this.config.LOOKUP_BATCH_SIZE;
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
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
   * Get current channel members
   */
  async getChannelMembers(channelId) {
    try {
      const result = await this.slack.conversations.members({
        channel: channelId
      });
      
      if (result.ok && Array.isArray(result.members)) {
        return result.members;
      }
      
      return [];
    } catch (error) {
      console.warn(`⚠️ Error getting members for channel ${channelId}:`, error.message);
      return [];
    }
  }

  /**
   * Get user info to check if user is a bot
   */
  async getUserInfo(userId) {
    try {
      const result = await this.slack.users.info({
        user: userId
      });
      
      if (result.ok && result.user) {
        return {
          id: result.user.id,
          is_bot: result.user.is_bot || false,
          is_workflow_bot: result.user.is_workflow_bot || false,
          deleted: result.user.deleted || false
        };
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️ Error getting user info for ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Invite users to channel
   */
  async inviteUsersToChannel(channelId, userIds) {
    if (userIds.length === 0) {
      return;
    }

    try {
      const result = await this.slack.conversations.invite({
        channel: channelId,
        users: userIds.join(',')
      });
      
      if (result.ok) {
        console.log(`✅ Invited ${userIds.length} users to channel ${channelId}`);
      } else {
        console.warn(`⚠️ Failed to invite users to channel ${channelId}: ${result.error}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error inviting users to channel ${channelId}:`, error.message);
    }
  }

  /**
   * Remove users from channel
   */
  async removeUsersFromChannel(channelId, userIds) {
    if (userIds.length === 0) {
      return;
    }

    for (const userId of userIds) {
      try {
        const result = await this.slack.conversations.kick({
          channel: channelId,
          user: userId
        });
        
        if (result.ok) {
          console.log(`✅ Removed user ${userId} from channel ${channelId}`);
        } else {
          console.warn(`⚠️ Failed to remove user ${userId} from channel ${channelId}: ${result.error}`);
        }
        
        await this.sleep(100); // Small delay between removals
      } catch (error) {
        console.warn(`⚠️ Error removing user ${userId} from channel ${channelId}:`, error.message);
      }
    }
  }

  /**
   * Sync channel memberships
   */
  async syncChannelMemberships(channelMembers, emailToUser) {
    for (const [channelId, targetEmails] of Object.entries(channelMembers)) {
      console.log(`\n🔄 Syncing channel ${channelId}...`);
      
      // Get current members
      const currentMemberIds = await this.getChannelMembers(channelId);
      console.log(`📊 Current members: ${currentMemberIds.length}`);
      
      // Convert target emails to user IDs
      const targetUserIds = targetEmails
        .map(email => emailToUser[email]?.id)
        .filter(Boolean);
      
      console.log(`📊 Target members: ${targetUserIds.length}`);
      
      // Find users to add and remove
      const currentSet = new Set(currentMemberIds);
      const targetSet = new Set(targetUserIds);
      
      const toAdd = targetUserIds.filter(id => !currentSet.has(id));
      const toRemove = currentMemberIds.filter(id => !targetSet.has(id));
      
      console.log(`➕ Users to add: ${toAdd.length}`);
      console.log(`➖ Users to remove: ${toRemove.length}`);
      
      if (this.dryRun) {
        console.log(`🧪 DRY RUN - Would add: ${toAdd.length}, remove: ${toRemove.length}`);
        continue;
      }
      
      // Add users
      if (toAdd.length > 0) {
        await this.inviteUsersToChannel(channelId, toAdd);
        await this.sleep(500);
      }
      
      // Remove users (but exclude bots and workflows)
      if (toRemove.length > 0) {
        const filteredToRemove = [];
        
        for (const userId of toRemove) {
          const userInfo = await this.getUserInfo(userId);
          
          if (userInfo) {
            if (userInfo.is_bot || userInfo.is_workflow_bot) {
              console.log(`🤖 Preserving bot/workflow: ${userId}`);
              continue;
            }
            if (userInfo.deleted) {
              console.log(`👻 Removing deleted user: ${userId}`);
            }
          }
          
          filteredToRemove.push(userId);
        }
        
        if (filteredToRemove.length > 0) {
          console.log(`➖ Actually removing: ${filteredToRemove.length} users (bots/workflows preserved)`);
          await this.removeUsersFromChannel(channelId, filteredToRemove);
          await this.sleep(500);
        } else {
          console.log(`🤖 No users to remove (all are bots/workflows)`);
        }
      }
    }
  }

  /**
   * Main sync function
   */
  async sync() {
    console.log('🚀 Starting Slack Channels Sync...\n');
    
    try {
      // Initialize Google Sheets
      await this.initializeSheets();
      
      // Read member data
      const members = await this.readMembers();
      console.log(`📊 Loaded ${members.length} members from sheet`);
      
      // Build targets
      const channelMembers = this.buildTargets(members);
      
      if (this.dryRun) {
        console.log('🧪 DRY RUN MODE - No changes will be made');
        console.log('📊 Would update channels:', Object.keys(channelMembers));
        return;
      }
      
      // Collect all unique emails
      const allEmails = new Set();
      Object.values(channelMembers).forEach(emails => {
        emails.forEach(email => allEmails.add(email));
      });
      
      // Resolve Slack users
      const emailToUser = await this.resolveSlackUsersBatched(Array.from(allEmails));
      
      // Sync channel memberships
      await this.syncChannelMemberships(channelMembers, emailToUser);
      
      console.log(`\n🎉 Sync completed successfully!`);
      console.log(`📊 Updated ${Object.keys(channelMembers).length} channels`);
      
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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const sync = new SlackChannelsSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('slack-channels-sync.js')) {
  main();
}

export default SlackChannelsSync;
