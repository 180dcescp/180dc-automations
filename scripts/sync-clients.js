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

import SanityClient from '../lib/clients/sanity-client.js';
import GoogleSheetsClient from '../lib/clients/google-sheets-client.js';
import SlackNotificationManager from '../lib/utils/slack-notifications.js';
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
    this.sanity = new SanityClient();
    this.sheets = new GoogleSheetsClient();
    this.notifications = new SlackNotificationManager();
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
        await this.notifications.notifyAutomationFailure({
          script: 'Client Sync',
          error: new Error('Connection test failed'),
          context: 'Some services are not accessible'
        });
        return;
      }

      console.log('✅ All connections successful!\n');

      // Get data from Google Sheets
      console.log('📊 Fetching client data from Google Sheets...');
      const sheetsData = await this.sheets.getClients();
      
      if (sheetsData.length === 0) {
        console.log('⚠️ No clients found in Google Sheets');
        await this.notifications.notifyAutomationSuccess({
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
        logoUrl: this.sheets.convertGoogleDriveUrl(client.logoUrl)
      }));

      // Sync to Sanity
      console.log('🔄 Syncing to Sanity CMS...');
      const syncResults = await this.sanity.syncClients(processedData);

      console.log('\n🎉 Client sync completed successfully!');
      console.log(`📊 Summary: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.deleted} deleted`);

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
        await this.notifications.notifyFailedLogos(syncResults.failedLogos);
      }

      // Send success notification
      await this.notifications.notifyAutomationSuccess({
        script: 'Client Sync',
        summary: `Synced ${sheetsData.length} clients from Google Sheets to Sanity CMS`,
        results: {
          created: syncResults.created,
          updated: syncResults.updated,
          deleted: syncResults.deleted,
          processed: sheetsData.length,
          errors: syncResults.errors.length
        },
        duration: Date.now() - startTime
      });

    } catch (error) {
      console.error('❌ Client sync failed:', error);
      
      // Send failure notification
      await this.notifications.notifyAutomationFailure({
        script: 'Client Sync',
        error: error,
        context: 'Client synchronization failed'
      });
      
      throw error;
    } finally {
      // Clean up resources
      if (this.sanity) {
        this.sanity.cleanup();
      }
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
      results.sanity = await this.sanity.testConnection();
    } catch (error) {
      console.error('Sanity connection failed:', error.message);
    }

    try {
      results.googleSheets = await this.sheets.testConnection();
    } catch (error) {
      console.error('Google Sheets connection failed:', error.message);
    }

    results.allConnected = results.sanity && results.googleSheets;
    return results;
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
