#!/usr/bin/env node

/**
 * Notion Groups Membership Sync
 * 
 * Migrated from Google Apps Script to GitHub Actions
 * Syncs Google Sheets member data with Notion workspace group memberships
 * 
 * Features:
 * - Extracts member data from Google Sheets "Member Database"
 * - Filters out Alumni members (Status = "Alumni")
 * - Assigns Consultants department to "Consultants" group
 * - Assigns all other departments to "Execs" group
 * - Generates actionable reports for manual Notion group management
 * - Slack notifications for success/failure
 */

import { google } from 'googleapis';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

class NotionGroupsSync {
  constructor() {
    // Validate required environment variables
    this.validateEnvironment();
    
    this.sheets = null;
    this.sheetsId = this.extractSheetId(process.env.GSHEET_MEMBERS_LINK);
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.slackChannel = process.env.SLACK_CHANNEL || '#automation-updates';
    this.slackEnabled = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL);
    this.dryRun = process.env.DRY_RUN === 'true';
    
    // Group configuration
    this.groups = {
      CONSULTANTS: 'Consultants',
      EXECS: 'Execs'
    };
    
    // Column names from the Google Sheet
    this.columns = {
      EMAIL: 'Email 180',
      DEPARTMENT: 'Department',
      STATUS: 'Status'
    };
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const required = [
      'GSHEET_MEMBERS_LINK',
      'GOOGLE_PROJECT_ID',
      'GOOGLE_PRIVATE_KEY_ID',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_CLIENT_ID',
      'SLACK_BOT_TOKEN'
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
      console.log('📊 Reading member data from Google Sheets...');
      
      // First, get the spreadsheet metadata to find the correct sheet name
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetsId
      });
      
      const sheets = spreadsheet.data.sheets || [];
      console.log(`📋 Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
      
      // Find the sheet that matches our target name (case-insensitive)
      const targetSheet = sheets.find(sheet => 
        sheet.properties?.title?.toLowerCase() === 'member database'
      );
      
      if (!targetSheet) {
        throw new Error(`Sheet "Member Database" not found. Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
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
      
      // Find column indices by name
      const getColumnIndex = (columnName) => {
        for (let i = 0; i < headers.length; i++) {
          if (headers[i] && headers[i].toString().toLowerCase().includes(columnName.toLowerCase())) {
            return i;
          }
        }
        return -1;
      };
      
      // Find required columns
      const columnIndices = {
        email: getColumnIndex(this.columns.EMAIL),
        department: getColumnIndex(this.columns.DEPARTMENT),
        status: getColumnIndex(this.columns.STATUS)
      };
      
      // Validate required columns exist
      const missingColumns = Object.entries(columnIndices)
        .filter(([key, index]) => index === -1)
        .map(([key]) => key);
      
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
      }
      
      console.log('📋 Column mapping:', columnIndices);
      
      // Transform rows to member objects
      const members = dataRows.map((row, index) => {
        const email = (row[columnIndices.email] || '').toString().trim();
        const department = (row[columnIndices.department] || '').toString().trim();
        const status = (row[columnIndices.status] || '').toString().trim();
        
        return {
          rowIndex: index + 2,
          email,
          department,
          status
        };
      }).filter(member => {
        // Only include members with valid email addresses
        return member.email && member.email.includes('@');
      });

      console.log(`📊 Loaded ${members.length} members with valid email addresses`);
      return members;
    } catch (error) {
      console.error('❌ Error reading members from sheet:', error);
      throw error;
    }
  }

  /**
   * Process members and assign them to groups
   */
  processGroupMemberships(members) {
    const groupMembers = {
      [this.groups.CONSULTANTS]: [],
      [this.groups.EXECS]: [],
      alumni: [],
      invalid: []
    };

    let processedCount = 0;
    let skippedCount = 0;

    for (const member of members) {
      const { email, department, status } = member;
      
      // Skip if no email
      if (!email || !email.includes('@')) {
        groupMembers.invalid.push({ ...member, reason: 'Invalid or missing email' });
        skippedCount++;
        continue;
      }

      // Check if alumni
      if (status.toLowerCase() === 'alumni') {
        groupMembers.alumni.push(member);
        skippedCount++;
        continue;
      }

      // Assign to groups based on department
      if (department.toLowerCase() === 'consultants') {
        groupMembers[this.groups.CONSULTANTS].push(member);
      } else if (department && department.trim()) {
        // All other valid departments go to Execs
        groupMembers[this.groups.EXECS].push(member);
      } else {
        // No department specified
        groupMembers.invalid.push({ ...member, reason: 'No department specified' });
        skippedCount++;
        continue;
      }

      processedCount++;
    }

    return {
      groupMembers,
      stats: {
        total: members.length,
        processed: processedCount,
        skipped: skippedCount,
        alumni: groupMembers.alumni.length,
        consultants: groupMembers[this.groups.CONSULTANTS].length,
        execs: groupMembers[this.groups.EXECS].length,
        invalid: groupMembers.invalid.length
      }
    };
  }

  /**
   * Generate group membership reports
   */
  generateReports(groupData) {
    const { groupMembers, stats } = groupData;
    
    console.log('\n📊 NOTION GROUPS MEMBERSHIP REPORT');
    console.log('=' .repeat(50));
    
    // Summary statistics
    console.log('\n📈 SUMMARY:');
    console.log(`  Total members processed: ${stats.total}`);
    console.log(`  Successfully assigned: ${stats.processed}`);
    console.log(`  Skipped (alumni/invalid): ${stats.skipped}`);
    console.log(`  Alumni (excluded): ${stats.alumni}`);
    console.log(`  Invalid entries: ${stats.invalid}`);
    
    // Consultants group
    console.log(`\n👥 ${this.groups.CONSULTANTS.toUpperCase()} GROUP (${stats.consultants} members):`);
    if (groupMembers[this.groups.CONSULTANTS].length > 0) {
      groupMembers[this.groups.CONSULTANTS].forEach(member => {
        console.log(`  • ${member.email} (${member.department})`);
      });
    } else {
      console.log('  (No members)');
    }
    
    // Execs group
    console.log(`\n👥 ${this.groups.EXECS.toUpperCase()} GROUP (${stats.execs} members):`);
    if (groupMembers[this.groups.EXECS].length > 0) {
      groupMembers[this.groups.EXECS].forEach(member => {
        console.log(`  • ${member.email} (${member.department})`);
      });
    } else {
      console.log('  (No members)');
    }
    
    // Alumni (for reference)
    if (groupMembers.alumni.length > 0) {
      console.log(`\n👥 ALUMNI (${stats.alumni} members - excluded from groups):`);
      groupMembers.alumni.forEach(member => {
        console.log(`  • ${member.email} (${member.department})`);
      });
    }
    
    // Invalid entries
    if (groupMembers.invalid.length > 0) {
      console.log(`\n⚠️ INVALID ENTRIES (${stats.invalid} members):`);
      groupMembers.invalid.forEach(member => {
        console.log(`  • ${member.email} - ${member.reason}`);
      });
    }
    
    console.log('\n' + '=' .repeat(50));
    
    return groupData;
  }

  /**
   * Send Slack notification for success
   */
  async notifySuccess(groupData) {
    if (!this.slackEnabled) return;

    const { stats } = groupData;
    const message = `✅ *Notion Groups Sync Completed Successfully*\n\n` +
      `📊 *Summary:*\n` +
      `• Total processed: ${stats.total}\n` +
      `• Consultants group: ${stats.consultants} members\n` +
      `• Execs group: ${stats.execs} members\n` +
      `• Alumni (excluded): ${stats.alumni}\n` +
      `• Invalid entries: ${stats.invalid}\n\n` +
      `⏰ *Time:* ${new Date().toLocaleString()}`;

    try {
      await this.slack.chat.postMessage({
        channel: this.slackChannel,
        text: 'Notion Groups Sync Completed',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          }
        ]
      });
      console.log('✅ Success notification sent to Slack');
    } catch (error) {
      console.error('❌ Failed to send success notification:', error);
    }
  }

  /**
   * Send Slack notification for failure
   */
  async notifyFailure(error) {
    if (!this.slackEnabled) return;

    const message = `❌ *Notion Groups Sync Failed*\n\n` +
      `🚨 *Error:* ${error.message}\n\n` +
      `🔧 *Action Required:* Check the GitHub Actions logs for details.\n\n` +
      `⏰ *Time:* ${new Date().toLocaleString()}`;

    try {
      await this.slack.chat.postMessage({
        channel: this.slackChannel,
        text: 'Notion Groups Sync Failed',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          }
        ]
      });
      console.log('✅ Failure notification sent to Slack');
    } catch (error) {
      console.error('❌ Failed to send failure notification:', error);
    }
  }

  /**
   * Main sync function
   */
  async sync() {
    console.log('🚀 Starting Notion Groups Membership Sync...\n');
    
    try {
      // Initialize Google Sheets
      await this.initializeSheets();
      
      // Read member data
      const members = await this.readMembers();
      
      if (members.length === 0) {
        console.log('⚠️ No members found in sheet');
        await this.notifySuccess({ stats: { total: 0, processed: 0, skipped: 0, alumni: 0, consultants: 0, execs: 0, invalid: 0 } });
        return;
      }

      // Process group memberships
      const groupData = this.processGroupMemberships(members);
      
      // Generate reports
      this.generateReports(groupData);
      
      // Send success notification
      await this.notifySuccess(groupData);
      
      console.log('\n🎉 Notion Groups Sync completed successfully!');

    } catch (error) {
      console.error('❌ Sync failed:', error);
      
      // Send failure notification
      await this.notifyFailure(error);
      
      throw error;
    }
  }
}

// Main execution
async function main() {
  const sync = new NotionGroupsSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('notion-groups-sync.js')) {
  main();
}

export default NotionGroupsSync;
