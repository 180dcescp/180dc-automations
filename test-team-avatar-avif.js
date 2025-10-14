#!/usr/bin/env node

/**
 * Test script for team member avatar AVIF conversion
 * Tests the system's ability to handle and notify about failed avatar conversions
 */

import SanityClient from './sanity-client.js';
import SlackNotificationManager from './slack-notifications.js';
import dotenv from 'dotenv';

dotenv.config();

async function testTeamAvatarAVIF() {
  console.log('🧪 Testing Team Member Avatar AVIF Conversion\n');
  
  const sanity = new SanityClient();
  const notifications = new SlackNotificationManager();
  
  // Test data with various avatar scenarios
  const testMembers = [
    {
      name: 'Test Member 1 - Valid Avatar',
      email: 'test1@example.com',
      position: 'Developer',
      department: 'Engineering',
      profileImage: 'https://via.placeholder.com/300x300/FF0000/FFFFFF?text=Valid+Avatar'
    },
    {
      name: 'Test Member 2 - Invalid URL',
      email: 'test2@example.com',
      position: 'Designer',
      department: 'Design',
      profileImage: 'invalid-url'
    },
    {
      name: 'Test Member 3 - Non-existent URL',
      email: 'test3@example.com',
      position: 'Manager',
      department: 'Operations',
      profileImage: 'https://nonexistent-domain-12345.com/avatar.jpg'
    },
    {
      name: 'Test Member 4 - No Avatar (Default)',
      email: 'test4@example.com',
      position: 'Analyst',
      department: 'Finance',
      profileImage: null // This simulates a default Slack avatar
    }
  ];

  console.log('📊 Testing team member sync with mixed avatar scenarios...\n');

  try {
    // Test the sync process
    const syncResults = await sanity.syncTeamMembers(testMembers);
    
    console.log('\n📊 Sync Results:');
    console.log(`  ✅ Created: ${syncResults.created}`);
    console.log(`  🔄 Updated: ${syncResults.updated}`);
    console.log(`  ❌ Errors: ${syncResults.errors.length}`);
    console.log(`  ⚠️ Failed Avatars: ${syncResults.failedAvatars ? syncResults.failedAvatars.length : 0}`);

    if (syncResults.failedAvatars && syncResults.failedAvatars.length > 0) {
      console.log('\n⚠️ Failed Avatar Details:');
      syncResults.failedAvatars.forEach((failedAvatar, index) => {
        console.log(`  ${index + 1}. ${failedAvatar.name}`);
        console.log(`     Avatar URL: ${failedAvatar.avatarUrl}`);
        console.log(`     Error: ${failedAvatar.error}\n`);
      });

      // Test Slack notification
      console.log('📱 Testing Slack notification for failed avatars...');
      await notifications.notifyFailedAvatars(syncResults.failedAvatars);
    }

    // Test individual avatar conversion
    console.log('\n🔍 Testing individual avatar conversion methods...');
    
    // Test valid avatar
    console.log('\n1. Testing valid avatar conversion:');
    const validResult = await sanity.uploadTeamMemberAvatarWithAVIF(
      'https://via.placeholder.com/300x300/00FF00/000000?text=Test+Avatar',
      'Test Valid Avatar'
    );
    console.log(`   Result: ${JSON.stringify(validResult, null, 2)}`);

    // Test invalid URL
    console.log('\n2. Testing invalid URL:');
    const invalidResult = await sanity.uploadTeamMemberAvatarWithAVIF(
      'invalid-url',
      'Test Invalid URL'
    );
    console.log(`   Result: ${JSON.stringify(invalidResult, null, 2)}`);

    // Test non-existent URL
    console.log('\n3. Testing non-existent URL:');
    const nonexistentResult = await sanity.uploadTeamMemberAvatarWithAVIF(
      'https://nonexistent-domain-12345.com/avatar.jpg',
      'Test Non-existent URL'
    );
    console.log(`   Result: ${JSON.stringify(nonexistentResult, null, 2)}`);

    console.log('\n✅ Team member avatar AVIF conversion test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    sanity.cleanup();
  }
}

// Run the test
async function main() {
  try {
    await testTeamAvatarAVIF();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('test-team-avatar-avif.js')) {
  main();
}
