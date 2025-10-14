#!/usr/bin/env node

/**
 * Team Member Sync Automation
 * 
 * This script automatically syncs team member data from Slack profiles to Sanity CMS.
 * It handles position extraction, department assignment, alumni exclusion, and default avatar detection.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import SanityClient from './sanity-client.js';
import SlackClient from './slack-client.js';
import SlackNotificationManager from './slack-notifications.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * TeamMemberSync class handles the synchronization of team member data
 * from Slack to Sanity CMS with intelligent processing and error handling.
 */
class TeamMemberSync {
  /**
   * Initialize the sync system with Sanity and Slack clients
   * @constructor
   */
  constructor() {
    this.sanity = new SanityClient();
    this.slack = new SlackClient();
    this.notifications = new SlackNotificationManager();
  }

  /**
   * Main sync process that orchestrates the entire team member synchronization
   * @async
   * @function sync
   * @returns {Promise<void>} Resolves when sync is complete
   */
  async sync() {
    const startTime = Date.now();
    console.log('🚀 Starting Team Member Sync Process...\n');
    
    try {
      // Test all connections first
      console.log('🔍 Testing connections...');
      const connections = await this.testConnections();
      
      if (!connections.allConnected) {
        console.error('❌ Some connections failed. Please check your configuration.');
        await this.notifications.notifyAutomationFailure({
          script: 'Team Member Sync',
          error: new Error('Connection test failed'),
          context: 'Some services are not accessible'
        });
        return;
      }

      console.log('✅ All connections successful!\n');

      // Get data from Slack
      console.log('📊 Fetching team member data from Slack...');
      const slackData = await this.slack.getTeamMembers();
      
      if (slackData.length === 0) {
        console.log('⚠️ No team members found in Slack');
        await this.notifications.notifyAutomationSuccess({
          script: 'Team Member Sync',
          summary: 'No team members found in Slack',
          results: { processed: 0, created: 0, updated: 0, deleted: 0 },
          duration: Date.now() - startTime
        });
        return;
      }

      console.log(`Found ${slackData.length} team members in Slack`);

      // Sync to Sanity
      console.log('🔄 Syncing to Sanity CMS...');
      const syncResults = await this.sanity.syncTeamMembers(slackData);

      // Update alumni count
      console.log('📊 Updating alumni count...');
      const alumniCount = await this.slack.getAlumniCount();
      await this.sanity.updateAlumniCount(alumniCount);

      console.log('\n🎉 Sync completed successfully!');
      console.log(`📊 Summary: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.deleted} deleted`);
      console.log(`👥 Alumni count: ${alumniCount}`);

      if (syncResults.errors.length > 0) {
        console.log(`❌ ${syncResults.errors.length} errors occurred`);
      }

      // Handle failed avatar conversions
      if (syncResults.failedAvatars && syncResults.failedAvatars.length > 0) {
        console.log(`\n⚠️ ${syncResults.failedAvatars.length} team members excluded due to avatar conversion failures:`);
        syncResults.failedAvatars.forEach(failedAvatar => {
          console.log(`  - ${failedAvatar.name}: ${failedAvatar.error}`);
        });

        // Send Slack notification for failed avatars
        await this.notifications.notifyFailedAvatars(syncResults.failedAvatars);
      }

      // Send success notification
      await this.notifications.notifyAutomationSuccess({
        script: 'Team Member Sync',
        summary: `Synced ${slackData.length} team members from Slack to Sanity CMS. Alumni count: ${alumniCount}`,
        results: {
          created: syncResults.created,
          updated: syncResults.updated,
          deleted: syncResults.deleted,
          processed: slackData.length,
          errors: syncResults.errors.length
        },
        duration: Date.now() - startTime
      });

    } catch (error) {
      console.error('❌ Sync failed:', error);
      
      // Send failure notification
      await this.notifications.notifyAutomationFailure({
        script: 'Team Member Sync',
        error: error,
        context: 'Team member synchronization failed'
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
      slack: false,
      allConnected: false
    };

    try {
      results.sanity = await this.sanity.testConnection();
    } catch (error) {
      console.error('Sanity connection failed:', error.message);
    }

    try {
      results.slack = await this.slack.testConnection();
    } catch (error) {
      console.error('Slack connection failed:', error.message);
    }

    results.allConnected = results.sanity && results.slack;
    return results;
  }
}

// Main execution
async function main() {
  const sync = new TeamMemberSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('sync-team-members.js')) {
  main();
}

export default TeamMemberSync;
