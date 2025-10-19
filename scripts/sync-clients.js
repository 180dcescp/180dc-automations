#!/usr/bin/env node

/**
 * Client Data Sync Automation
 * 
 * This script automatically syncs client data from Google Sheets to Sanity CMS.
 * It handles Google Drive URL conversion, field validation, and error handling.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import { createClient } from '@sanity/client';
import { google } from 'googleapis';
import { WebClient } from '@slack/web-api';
import AVIFConverter from '../tools/avif-converter.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * ClientSync class handles the synchronization of client data
 * from Google Sheets to Sanity CMS with validation and error handling.
 */
class ClientSync {
  /**
   * Initialize the sync system with Sanity and Google Sheets clients
   * @constructor
   */
  constructor() {
    // Initialize Sanity client
    this.sanity = createClient({
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET,
      token: process.env.SANITY_TOKEN,
      useCdn: false, // Use the live API for mutations
      apiVersion: '2023-12-01',
    });

    // Initialize Google Sheets client
    this.sheets = null;
    this.sheetsId = this.extractSheetId(process.env.GSHEET_CLIENTS_LINK);
    this.initializeGoogleSheets();

    // Initialize Slack client
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.slackChannel = process.env.SLACK_CHANNEL || '#automation-updates';
    this.slackEnabled = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL);
    
    // Initialize AVIF converter
    this.avifConverter = new AVIFConverter();
  }

  /**
   * Extract sheet ID from Google Sheets URL
   */
  extractSheetId(url) {
    if (!url) {
      throw new Error('GSHEET_CLIENTS_LINK environment variable is required');
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
  initializeGoogleSheets() {
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
    } catch (error) {
      console.error('Failed to initialize Google Sheets authentication:', error);
      throw error;
    }
  }

  /**
   * Test connection to Google Sheets
   */
  async testGoogleSheetsConnection() {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets not initialized');
      }

      const spreadsheetId = this.sheetsId;
      if (!spreadsheetId) {
        throw new Error('GSHEET_CLIENTS_LINK not set in environment variables');
      }

      // Try to get spreadsheet metadata
      await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });

      console.log('✅ Google Sheets connection successful');
      return true;
    } catch (error) {
      console.error('❌ Google Sheets connection failed:', error.message);
      return false;
    }
  }

  /**
   * Test connection to Sanity
   */
  async testSanityConnection() {
    try {
      const query = `*[_type == "client"][0]`;
      await this.sanity.fetch(query);
      console.log('✅ Sanity connection successful');
      return true;
    } catch (error) {
      console.error('❌ Sanity connection failed:', error.message);
      return false;
    }
  }

  /**
   * Get all clients from Google Sheets
   */
  async getClients() {
    try {
      const spreadsheetId = this.sheetsId;
      
      console.log(`📊 Fetching clients from Google Sheets: ${spreadsheetId}`);
      
      // First, get the sheet metadata to find the actual data range
      const sheetMetadata = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });
      
      // Get the first sheet (tab)
      const firstSheet = sheetMetadata.data.sheets[0];
      const sheetName = firstSheet.properties.title;
      
      console.log(`📊 Found sheet: "${sheetName}"`);
      
      // Try to find the actual data range by looking for the "Client Database" table
      // First, get a large range to scan for data
      const scanRange = `${sheetName}!A1:Z1000`;
      
      const scanResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: scanRange
      });
      
      const allRows = scanResponse.data.values || [];
      
      // Find the header row (look for "Client Name" or similar)
      let headerRowIndex = -1;
      let dataStartRow = -1;
      
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        if (row && row.length > 0) {
          const firstCell = row[0]?.toString().toLowerCase();
          if (firstCell && (firstCell.includes('client name') || firstCell.includes('client') || firstCell.includes('name'))) {
            headerRowIndex = i;
            dataStartRow = i + 1; // Data starts after header
            break;
          }
        }
      }
      
      if (headerRowIndex === -1) {
        console.log('⚠️ Could not find header row, using default range');
        // Fallback to default range
        const range = process.env.GOOGLE_SHEETS_RANGE || `${sheetName}!A:F`;
        console.log(`📊 Using fallback range: ${range}`);
        
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          range: range
        });
        
        return this.processClientData(response.data.values);
      }
      
      // Find the last row with data
      let lastDataRow = dataStartRow;
      for (let i = dataStartRow; i < allRows.length; i++) {
        const row = allRows[i];
        if (row && row.length > 0 && row.some(cell => cell && cell.toString().trim() !== '')) {
          lastDataRow = i;
        }
      }
      
      // Find the last column with data
      let lastDataColumn = 0;
      for (let i = dataStartRow; i <= lastDataRow; i++) {
        const row = allRows[i];
        if (row) {
          for (let j = row.length - 1; j >= 0; j--) {
            if (row[j] && row[j].toString().trim() !== '') {
              lastDataColumn = Math.max(lastDataColumn, j);
              break;
            }
          }
        }
      }
      
      // Create range from header to last data
      const columnLetter = String.fromCharCode(65 + lastDataColumn); // A=65, B=66, etc.
      const range = `${sheetName}!A${headerRowIndex + 1}:${columnLetter}${lastDataRow + 1}`;
      
      console.log(`📊 Using dynamic range: ${range} (${lastDataRow - dataStartRow + 1} data rows)`);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range
      });

      return this.processClientData(response.data.values);

    } catch (error) {
      console.error('Error fetching clients from Google Sheets:', error);
      throw error;
    }
  }

  /**
   * Process client data from Google Sheets rows
   */
  processClientData(rows) {
    if (!rows || rows.length === 0) {
      console.log('No data found in Google Sheets');
      return [];
    }

    // Skip header row if it exists
    const dataRows = rows.slice(1);
    
    console.log(`\n📋 Processing ${dataRows.length} rows from Google Sheets:`);
    console.log('=' .repeat(80));
    
    // Get header row to determine column mapping
    const headerRow = rows[0] || [];
    const columnMap = {};
    
    // Map column headers to their indices - using exact column names for essential fields only
    headerRow.forEach((header, index) => {
      const normalizedHeader = header?.toString().toLowerCase().trim();
      
      // Map to essential fields only
      if (normalizedHeader === 'client name') {
        columnMap.name = index;
      } else if (normalizedHeader === 'website') {
        columnMap.website = index;
      } else if (normalizedHeader === 'country') {
        columnMap.country = index;
      } else if (normalizedHeader === 'gtm vertical') {
        columnMap.industry = index;
      } else if (normalizedHeader === 'project type') {
        columnMap.projectType = index;
      } else if (normalizedHeader === 'client logo') {
        columnMap.logoUrl = index;
      } else if (normalizedHeader === 'cycle (fall/spring [year])') {
        columnMap.cycle = index;
      }
    });
    
    console.log('📋 Column mapping detected:', columnMap);
    
    const clients = dataRows
      .map((row, index) => {
        // Map columns by header names - essential fields only
        const name = row[columnMap.name];
        const website = row[columnMap.website];
        const country = row[columnMap.country];
        const industry = row[columnMap.industry];
        const projectType = row[columnMap.projectType];
        const logoUrl = row[columnMap.logoUrl];
        const cycle = row[columnMap.cycle];
        
        console.log(`\n📄 Row ${index + 2}:`);
        console.log(`   Name: "${name || 'MISSING'}"`);
        console.log(`   Website: "${website || 'MISSING'}"`);
        console.log(`   Industry: "${industry || 'MISSING'}"`);
        console.log(`   Logo URL: "${logoUrl || 'N/A (optional)'}"`);
        console.log(`   Country: "${country || 'N/A'}"`);
        console.log(`   Project Type: "${projectType || 'N/A'}"`);
        console.log(`   Cycle: "${cycle || 'N/A'}"`);
        
        // Only include clients with all required fields (name, website, industry)
        // Logo is optional - client can be synced without logo
        if (!name || !website || !industry) {
          console.warn(`   ❌ SKIPPING: Missing required fields (name, website, or industry)`);
          return null;
        }

        // Ensure website URL has protocol
        let websiteUrl = website.trim();
        if (websiteUrl && !websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
          websiteUrl = `https://${websiteUrl}`;
        }

        const client = {
          name: name.trim(),
          website: websiteUrl,
          industry: industry.trim(),
          logoUrl: logoUrl.trim(),
          country: country ? country.trim() : '',
          projectType: projectType ? projectType.trim() : '',
          cycle: cycle ? cycle.trim() : ''
        };
        
        console.log(`   ✅ VALID: Will be synced to Sanity`);
        if (websiteUrl !== website.trim()) {
          console.log(`   🔗 Website URL corrected: "${website.trim()}" → "${websiteUrl}"`);
        }
        return client;
      })
      .filter(client => client !== null);

    console.log('\n' + '=' .repeat(80));
    console.log(`📊 Summary: Found ${clients.length} valid clients out of ${dataRows.length} rows`);
    console.log(`📋 Required fields: name, website, industry (logo is optional)`);
    
    if (clients.length > 0) {
      console.log('\n🎯 Clients that will be synced:');
      clients.forEach((client, index) => {
        console.log(`   ${index + 1}. ${client.name} (${client.industry}) - ${client.website}`);
        if (client.country) console.log(`      Country: ${client.country}`);
        if (client.projectType) console.log(`      Project Type: ${client.projectType}`);
        if (client.logoUrl) console.log(`      Logo: ${client.logoUrl}`);
      });
    }
    
    return clients;
  }

  /**
   * Convert Google Drive logo URL to accessible URL
   */
  convertGoogleDriveUrl(logoUrl) {
    try {
      // Handle different Google Drive URL formats
      if (logoUrl.includes('drive.google.com/file/d/')) {
        // Format: https://drive.google.com/file/d/FILE_ID/view
        const fileIdMatch = logoUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
      } else if (logoUrl.includes('drive.google.com/open')) {
        // Format: https://drive.google.com/open?id=FILE_ID
        const fileIdMatch = logoUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
      } else if (logoUrl.includes('drive.google.com/uc')) {
        // Already in the correct format
        return logoUrl;
      }

      console.warn(`Could not convert Google Drive URL: ${logoUrl}`);
      return logoUrl; // Return original URL as fallback
    } catch (error) {
      console.error('Error converting Google Drive URL:', error);
      return logoUrl; // Return original URL as fallback
    }
  }

  /**
   * Main sync process that orchestrates the entire client synchronization
   * @async
   * @function sync
   * @returns {Promise<void>} Resolves when sync is complete
   */
  async sync() {
    const startTime = Date.now();
    console.log('🚀 Starting Client Sync Process...\n');
    
    try {
      // Test all connections first
      console.log('🔍 Testing connections...');
      const connections = await this.testConnections();
      
      if (!connections.allConnected) {
        console.error('❌ Some connections failed. Please check your configuration.');
        await this.notifyAutomationFailure({
          script: 'Client Sync',
          error: new Error('Connection test failed'),
          context: 'Some services are not accessible'
        });
        return;
      }

      console.log('✅ All connections successful!\n');

      // Get data from Google Sheets
      console.log('📊 Fetching client data from Google Sheets...');
      const sheetsData = await this.getClients();
      
      if (sheetsData.length === 0) {
        console.log('⚠️ No clients found in Google Sheets');
        await this.notifyAutomationSuccess({
          script: 'Client Sync',
          summary: 'No clients found in Google Sheets',
          results: { processed: 0, created: 0, updated: 0, deleted: 0 },
          duration: Date.now() - startTime
        });
        return;
      }

      console.log(`Found ${sheetsData.length} clients in Google Sheets`);

      // Convert Google Drive URLs to accessible URLs
      console.log('🔄 Converting Google Drive URLs...');
      const processedData = sheetsData.map(client => ({
        ...client,
        logoUrl: this.convertGoogleDriveUrl(client.logoUrl)
      }));

      // Sync to Sanity
      console.log('🔄 Syncing to Sanity CMS...');
      const syncResults = await this.syncClients(processedData);

      console.log('\n🎉 Client sync completed successfully!');
      console.log(`📊 Summary: ${syncResults.created} created, ${syncResults.deleted} deleted`);

      if (syncResults.errors.length > 0) {
        console.log(`❌ ${syncResults.errors.length} errors occurred`);
        syncResults.errors.forEach(error => {
          console.log(`  - ${error.name}: ${error.error}`);
        });
      }

      // Handle failed logo conversions
      if (syncResults.failedLogos && syncResults.failedLogos.length > 0) {
        console.log(`\n⚠️ ${syncResults.failedLogos.length} clients excluded due to logo conversion failures:`);
        syncResults.failedLogos.forEach(failedLogo => {
          console.log(`  - ${failedLogo.name}: ${failedLogo.error}`);
        });

        // Send Slack notification for failed logos
        await this.notifyFailedLogos(syncResults.failedLogos);
      }

      // Send success notification
      await this.notifyAutomationSuccess({
        script: 'Client Sync',
        summary: `Synced ${sheetsData.length} clients from Google Sheets to Sanity CMS`,
        results: {
          created: syncResults.created,
          deleted: syncResults.deleted,
          processed: sheetsData.length,
          errors: syncResults.errors.length
        },
        duration: Date.now() - startTime
      });

    } catch (error) {
      console.error('❌ Client sync failed:', error);
      
      // Send failure notification
      await this.notifyAutomationFailure({
        script: 'Client Sync',
        error: error,
        context: 'Client synchronization failed'
      });
      
      throw error;
    }
  }

  /**
   * Test all service connections
   */
  async testConnections() {
    const results = {
      sanity: false,
      googleSheets: false,
      allConnected: false
    };

    try {
      results.sanity = await this.testSanityConnection();
    } catch (error) {
      console.error('Sanity connection failed:', error.message);
    }

    try {
      results.googleSheets = await this.testGoogleSheetsConnection();
    } catch (error) {
      console.error('Google Sheets connection failed:', error.message);
    }

    results.allConnected = results.sanity && results.googleSheets;
    return results;
  }

  /**
   * Upload client logo to Sanity with AVIF conversion
   */
  async uploadLogoToSanity(logoUrl, clientName) {
    if (!logoUrl) {
      return null;
    }
    
    try {
      console.log(`📸 Processing logo for ${clientName}...`);
      
      // Convert to AVIF using the converter
      const avifBuffer = await this.avifConverter.convertUrlToAVIF(
        logoUrl, 
        `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_logo`,
        { quality: 85, effort: 4 }
      );
      
      // Upload to Sanity
      const asset = await this.sanity.assets.upload('image', avifBuffer, {
        filename: `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_logo.avif`,
        contentType: 'image/avif'
      });
      
      console.log(`✅ Logo uploaded for ${clientName}: ${asset._id}`);
      
      return {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: asset._id
        }
      };
    } catch (error) {
      console.error(`❌ Failed to upload logo for ${clientName}:`, error.message);
      return null;
    }
  }

  /**
   * Get all existing clients from Sanity
   */
  async getExistingClients() {
    try {
      const query = `*[_type == "client"] {
        _id,
        name,
        website,
        industry,
        logo,
        country,
        projectType,
        cycle
      }`;
      
      const clients = await this.sanity.fetch(query);
      console.log(`Found ${clients.length} existing clients in Sanity`);
      return clients;
    } catch (error) {
      console.error('Error fetching existing clients:', error);
      throw error;
    }
  }

  /**
   * Create a new client in Sanity
   */
  async createClient(clientData) {
    try {
      const doc = {
        _type: 'client',
        name: clientData.name,
        website: clientData.website,
        industry: clientData.industry,
        country: clientData.country || '',
        projectType: clientData.projectType || '',
        cycle: clientData.cycle || ''
      };

      // Add logo if provided (with AVIF conversion)
      if (clientData.logoUrl && clientData.logoUrl.trim()) {
        try {
          const logoAsset = await this.uploadLogoToSanity(clientData.logoUrl, clientData.name);
          if (logoAsset) {
            doc.logo = logoAsset;
          }
        } catch (error) {
          console.warn(`⚠️ Logo processing failed for ${clientData.name}: ${error.message}, creating client without logo`);
        }
      } else {
        console.log(`ℹ️ No logo provided for ${clientData.name} - creating client without logo`);
      }

      const result = await this.sanity.create(doc);
      console.log(`✅ Created client: ${clientData.name}`);
      return result;
    } catch (error) {
      console.error(`❌ Error creating client ${clientData.name}:`, error);
      throw error;
    }
  }

  /**
   * Delete all existing clients from Sanity
   */
  async deleteAllClients() {
    try {
      console.log('🗑️ Deleting all existing clients from Sanity...');
      
      const existingClients = await this.getExistingClients();
      console.log(`Found ${existingClients.length} existing clients to delete`);
      
      let deleted = 0;
      for (const client of existingClients) {
        try {
          await this.sanity.delete(client._id);
          deleted++;
          console.log(`✅ Deleted client: ${client.name}`);
        } catch (error) {
          console.error(`❌ Error deleting client ${client.name}:`, error);
        }
      }
      
      console.log(`🗑️ Deleted ${deleted} clients from Sanity`);
      return deleted;
    } catch (error) {
      console.error('Error deleting all clients:', error);
      throw error;
    }
  }

  /**
   * Sync clients from Google Sheets data using delete-and-recreate strategy
   */
  async syncClients(sheetsData) {
    try {
      const results = {
        created: 0,
        deleted: 0,
        errors: [],
        failedLogos: []
      };

      // Step 1: Delete all existing clients
      results.deleted = await this.deleteAllClients();

      // Step 2: Create new clients from Google Sheets data
      console.log(`📝 Creating ${sheetsData.length} new clients from Google Sheets...`);
      
      for (const clientData of sheetsData) {
        try {
          if (!clientData.name) {
            console.warn(`Skipping client - no name provided`);
            continue;
          }

          await this.createClient(clientData);
          results.created++;
        } catch (error) {
          console.error(`Error creating client ${clientData.name}:`, error);
          results.errors.push({ name: clientData.name, error: error.message });
        }
      }

      console.log('📊 Client Sync Results:', results);
      return results;
    } catch (error) {
      console.error('Error syncing clients:', error);
      throw error;
    }
  }

  /**
   * Send a notification for automation success
   */
  async notifyAutomationSuccess({ script, summary, results, duration }) {
    if (!this.slackEnabled) return;

    const durationText = duration ? ` (${Math.round(duration / 1000)}s)` : '';
    let message = `✅ *${script} Completed Successfully*${durationText}\n\n`;
    message += `📊 *Summary:* ${summary}\n\n`;
    
    if (results) {
      message += `📈 *Results:*\n`;
      if (results.created) message += `• ✅ Created: ${results.created}\n`;
      if (results.deleted) message += `• 🗑️ Deleted: ${results.deleted}\n`;
      if (results.processed) message += `• 📊 Processed: ${results.processed}\n`;
      if (results.skipped) message += `• ⏭️ Skipped: ${results.skipped}\n`;
    }

    message += `\n⏰ *Time:* ${new Date().toLocaleString()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendSlackMessage(message, blocks);
  }

  /**
   * Send a notification for automation failure
   */
  async notifyAutomationFailure({ script, error, context }) {
    if (!this.slackEnabled) return;

    let message = `❌ *${script} Failed*\n\n`;
    message += `🚨 *Error:* ${error.message}\n`;
    
    if (context) {
      message += `📝 *Context:* ${context}\n`;
    }

    message += `\n⏰ *Time:* ${new Date().toLocaleString()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    // Add error details in a code block
    if (error.stack) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`\n${error.stack}\n\`\`\``
        }
      });
    }

    await this.sendSlackMessage(message, blocks);
  }

  /**
   * Send notification for clients with failed logo conversions
   */
  async notifyFailedLogos(failedLogos) {
    if (!this.slackEnabled || !failedLogos || failedLogos.length === 0) return;

    try {
      let message = `⚠️ *Client Logo Conversion Failures*\n\n`;
      message += `The following clients were excluded from sync due to logo conversion failures:\n\n`;

      failedLogos.forEach((failedLogo, index) => {
        message += `${index + 1}. *${failedLogo.name}*\n`;
        message += `   • Logo URL: ${failedLogo.logoUrl}\n`;
        message += `   • Error: ${failedLogo.error}\n\n`;
      });

      message += `🔧 *Action Required:*\n`;
      message += `Please update the logo URLs for these clients in Google Sheets with valid image formats (JPEG, PNG, WebP, GIF, BMP, TIFF).\n\n`;
      message += `💡 *Tip:* Ensure the logo URLs are publicly accessible and point to actual image files.`;

      const result = await this.slack.chat.postMessage({
        channel: this.slackChannel,
        text: 'Client Logo Conversion Failures',
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

      console.log('✅ Failed logos notification sent to Slack');
      return result;
    } catch (error) {
      console.error('❌ Error sending failed logos notification:', error);
      return null;
    }
  }

  /**
   * Send a message to Slack
   */
  async sendSlackMessage(text, blocks = null) {
    if (!this.slackEnabled) {
      console.log('📱 Slack notification (disabled):', text);
      return;
    }

    try {
      const payload = {
        channel: this.slackChannel,
        text: text,
        blocks: blocks,
        unfurl_links: false,
        unfurl_media: false
      };

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Slack notification sent: ${result.ts}`);
        return result;
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to send Slack notification:', errorText);
        throw new Error(`Slack API error: ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error sending Slack notification:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const sync = new ClientSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('sync-clients.js')) {
  main();
}

export default ClientSync;
