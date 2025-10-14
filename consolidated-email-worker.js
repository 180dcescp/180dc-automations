/**
 * Consolidated Email Worker
 * 
 * Single email worker that handles all email forwarding:
 * - Standard email forwarding to configured destination
 * - Presidency department email forwarding to ESCP and private emails
 * - Automatic presidency member detection from Google Sheets
 * - "Forwarded from xxx@180dc-escp.org" disclaimer
 * 
 * Features:
 * - Reads presidency members from Google Sheets
 * - Forwards to both ESCP and private email addresses
 * - Comprehensive logging and error handling
 * - No need for multiple workers or complex setup
 */

import { google } from 'googleapis';

export default {
  async email(message, env, ctx) {
    // Get email details at the top level for error handling
    const to = message.to;
    const from = message.from;
    const subject = message.headers.get('subject') || 'No Subject';
    const defaultDestination = 'sebimichel1@gmail.com'; // Default destination
    
    try {
      // Log email details for debugging
      console.log(`📧 Email received:`);
      console.log(`   To: ${to}`);
      console.log(`   From: ${from}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Date: ${new Date().toISOString()}`);

      // Check if this is a presidency-related email
      const isPresidencyEmail = to.includes('presidency') || to.includes('president') || to.includes('vice-president');
      
      if (isPresidencyEmail) {
        console.log(`🏛️ Presidency email detected - forwarding to presidency members`);
        
        // Forward to presidency members
        await this.forwardToPresidency(message, env);
        
        console.log(`✅ Presidency email forwarding completed`);
      } else {
        console.log(`📤 Standard email forwarding to: ${defaultDestination}`);
        
        // Standard forwarding
        await message.forward(defaultDestination);
        
        console.log(`✅ Standard email forwarding completed`);
      }

      // Log email details for debugging delivery
      console.log(`📋 Email Details:`);
      console.log(`   Original From: ${from}`);
      console.log(`   Original To: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Forwarded To: ${isPresidencyEmail ? 'Presidency Members' : defaultDestination}`);
      console.log(`   Message ID: ${message.headers.get('message-id') || 'No Message ID'}`);
      console.log(`   Date: ${message.headers.get('date') || 'No Date'}`);

      // Optional: Send auto-reply for certain types of emails
      if (from.includes('noreply') || from.includes('no-reply')) {
        console.log(`🤖 Sending auto-reply to: ${from}`);
        try {
          await message.reply(
            'Thank you for contacting 180 Degrees Consulting ESCP. We have received your message and will respond within 24 hours.\n\nBest regards,\nThe 180DC ESCP Team'
          );
          console.log(`✅ Auto-reply sent successfully`);
        } catch (replyError) {
          console.error(`❌ Auto-reply failed:`, replyError);
        }
      }

      console.log(`✅ Email processed successfully`);
      console.log(`📧 Email forwarding complete`);

    } catch (error) {
      console.error(`❌ Error processing email:`, error);

      // Log error with proper variable scope
      console.error(`❌ Email processing failed for ${from} to ${to}: ${error.message}`);

      // Log specific error details
      if (error.message.includes('destination address not verified')) {
        console.error(`🚨 Destination email needs to be verified in Cloudflare Email Routing`);
        console.error(`🔧 To fix: Go to Cloudflare Dashboard → Email Routing → Add destination`);
        console.error(`📧 The email address exists but needs to be added to Cloudflare Email Routing destinations`);
      } else if (error.message.includes('no such user')) {
        console.error(`🚨 Email address doesn't exist or is not configured`);
        console.error(`🔧 Check if the email address is set up correctly on the mail server`);
      } else {
        console.error(`🚨 Unknown email delivery error: ${error.message}`);
        console.error(`🔧 This could be a mail server configuration issue`);
      }
    }
  },

  /**
   * Forward email to presidency members
   */
  async forwardToPresidency(message, env) {
    try {
      // Get presidency members from Google Sheets
      const presidencyMembers = await this.getPresidencyMembers(env);
      
      if (presidencyMembers.length === 0) {
        console.log('⚠️ No presidency members found for forwarding');
        return;
      }

      const to = message.to;
      const from = message.from;
      const subject = message.headers.get('subject') || 'No Subject';
      
      console.log(`📧 Forwarding email to ${presidencyMembers.length} presidency members:`);
      console.log(`   From: ${from}`);
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);

      // Forward to each presidency member's emails
      for (const member of presidencyMembers) {
        try {
          console.log(`📤 Forwarding to ${member.name} (${member.position})`);
          
          // Create disclaimer
          const disclaimer = this.generateDisclaimer(from, to);
          
          // Forward to ESCP email if available
          if (member.emailEscp && member.emailEscp.trim()) {
            console.log(`   📧 ESCP Email: ${member.emailEscp}`);
            await message.forward(member.emailEscp);
            console.log(`   ✅ Successfully forwarded to ESCP email`);
          }
          
          // Forward to private email if available
          if (member.emailPrivate && member.emailPrivate.trim()) {
            console.log(`   📧 Private Email: ${member.emailPrivate}`);
            await message.forward(member.emailPrivate);
            console.log(`   ✅ Successfully forwarded to private email`);
          }
          
          console.log(`✅ Successfully forwarded to ${member.name}`);
        } catch (error) {
          console.error(`❌ Failed to forward to ${member.name}:`, error);
        }
      }

      console.log(`✅ Email forwarding to presidency completed`);
    } catch (error) {
      console.error('❌ Error forwarding to presidency:', error);
      throw error;
    }
  },

  /**
   * Get presidency members from Google Sheets
   */
  async getPresidencyMembers(env) {
    try {
      console.log('📊 Loading presidency members from Google Sheets...');
      
      // Initialize Google Sheets API
      const auth = new google.auth.GoogleAuth({
        credentials: {
          type: 'service_account',
          project_id: env.GOOGLE_PROJECT_ID,
          private_key_id: env.GOOGLE_PRIVATE_KEY_ID,
          private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: env.GOOGLE_CLIENT_EMAIL,
          client_id: env.GOOGLE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${env.GOOGLE_CLIENT_EMAIL}`
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });

      const sheets = google.sheets({ version: 'v4', auth });
      
      // Extract sheet ID from Google Sheets URL
      const sheetsId = this.extractSheetId(env.GSHEET_MEMBERS_LINK);
      
      // Get spreadsheet metadata
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: sheetsId
      });
      
      const sheetList = spreadsheet.data.sheets || [];
      const targetSheet = sheetList.find(sheet => 
        sheet.properties?.title?.toLowerCase() === 'members'
      );
      
      if (!targetSheet) {
        throw new Error(`Sheet "Members" not found`);
      }
      
      const actualSheetName = targetSheet.properties.title;
      console.log(`📊 Using sheet: "${actualSheetName}"`);
      
      // Get data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetsId,
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
        for (let i = 0; i < headers.length; i++) {
          if (headers[i] && headers[i].toString().toLowerCase().includes(columnName.toLowerCase())) {
            return i;
          }
        }
        return -1;
      };
      
      const columnIndices = {
        name: getColumnIndex('Full Name') !== -1 ? getColumnIndex('Full Name') : 0,
        position: getColumnIndex('Position') !== -1 ? getColumnIndex('Position') : 3,
        department: getColumnIndex('Department') !== -1 ? getColumnIndex('Department') : 4,
        status: getColumnIndex('Status') !== -1 ? getColumnIndex('Status') : 7,
        emailEscp: getColumnIndex('Email ESCP') !== -1 ? getColumnIndex('Email ESCP') : 9,
        emailPrivate: getColumnIndex('Email Private') !== -1 ? getColumnIndex('Email Private') : 10
      };
      
      // Transform rows to member objects and filter for presidency
      const members = dataRows.map((row, index) => {
        return {
          name: row[columnIndices.name] || '',
          position: row[columnIndices.position] || '',
          department: row[columnIndices.department] || '',
          status: row[columnIndices.status] || '',
          emailEscp: row[columnIndices.emailEscp] || '',
          emailPrivate: row[columnIndices.emailPrivate] || '',
          rowIndex: index + 2
        };
      }).filter(member => {
        // Only include active presidency members with at least one email
        return member.name.trim() && 
               member.department === 'Presidency' && 
               member.status === 'Active' &&
               (member.emailEscp.trim() || member.emailPrivate.trim());
      });

      console.log(`📊 Loaded ${members.length} active presidency members:`);
      members.forEach(member => {
        console.log(`  - ${member.name} (${member.position})`);
        console.log(`    ESCP Email: ${member.emailEscp || 'Not provided'}`);
        console.log(`    Private Email: ${member.emailPrivate || 'Not provided'}`);
      });

      return members;
    } catch (error) {
      console.error('❌ Error loading presidency members:', error);
      throw error;
    }
  },

  /**
   * Extract sheet ID from Google Sheets URL
   */
  extractSheetId(url) {
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
  },

  /**
   * Generate email forwarding disclaimer
   */
  generateDisclaimer(originalFrom, originalTo) {
    return `\n\n---\nForwarded from ${originalTo}@180dc-escp.org\nOriginal sender: ${originalFrom}\nForwarded by 180DC ESCP Email System`;
  }
};
