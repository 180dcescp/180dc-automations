#!/usr/bin/env node

/**
 * Test script for failed logo conversion handling
 * Tests the system's ability to handle and notify about failed logo conversions
 */

import SanityClient from '../lib/clients/sanity-client.js';
import SlackNotificationManager from '../lib/utils/slack-notifications.js';
import dotenv from 'dotenv';

dotenv.config();

async function testFailedLogoHandling() {
  console.log('🧪 Testing Failed Logo Conversion Handling\n');
  
  const sanity = new SanityClient();
  const notifications = new SlackNotificationManager();
  
  // Test data with various logo scenarios
  const testClients = [
    {
      name: 'Test Client 1 - Valid Logo',
      logoUrl: 'https://via.placeholder.com/300x200/FF0000/FFFFFF?text=Valid+Logo',
      website: 'https://example1.com',
      industry: 'Technology'
    },
    {
      name: 'Test Client 2 - Invalid URL',
      logoUrl: 'invalid-url',
      website: 'https://example2.com',
      industry: 'Finance'
    },
    {
      name: 'Test Client 3 - Non-existent URL',
      logoUrl: 'https://nonexistent-domain-12345.com/image.jpg',
      website: 'https://example3.com',
      industry: 'Healthcare'
    },
    {
      name: 'Test Client 4 - No Logo',
      logoUrl: null,
      website: 'https://example4.com',
      industry: 'Education'
    }
  ];

  console.log('📊 Testing client sync with mixed logo scenarios...\n');

  try {
    // Test the sync process
    const syncResults = await sanity.syncClients(testClients);
    
    console.log('\n📊 Sync Results:');
    console.log(`  ✅ Created: ${syncResults.created}`);
    console.log(`  🔄 Updated: ${syncResults.updated}`);
    console.log(`  ❌ Errors: ${syncResults.errors.length}`);
    console.log(`  ⚠️ Failed Logos: ${syncResults.failedLogos ? syncResults.failedLogos.length : 0}`);

    if (syncResults.failedLogos && syncResults.failedLogos.length > 0) {
      console.log('\n⚠️ Failed Logo Details:');
      syncResults.failedLogos.forEach((failedLogo, index) => {
        console.log(`  ${index + 1}. ${failedLogo.name}`);
        console.log(`     URL: ${failedLogo.logoUrl}`);
        console.log(`     Error: ${failedLogo.error}\n`);
      });

      // Test Slack notification
      console.log('📱 Testing Slack notification for failed logos...');
      await notifications.notifyFailedLogos(syncResults.failedLogos);
    }

    // Test individual logo conversion
    console.log('\n🔍 Testing individual logo conversion methods...');
    
    // Test valid logo
    console.log('\n1. Testing valid logo conversion:');
    const validResult = await sanity.uploadClientLogoWithAVIF(
      'https://via.placeholder.com/300x200/00FF00/000000?text=Test+Logo',
      'Test Valid Logo'
    );
    console.log(`   Result: ${JSON.stringify(validResult, null, 2)}`);

    // Test invalid URL
    console.log('\n2. Testing invalid URL:');
    const invalidResult = await sanity.uploadClientLogoWithAVIF(
      'invalid-url',
      'Test Invalid URL'
    );
    console.log(`   Result: ${JSON.stringify(invalidResult, null, 2)}`);

    // Test non-existent URL
    console.log('\n3. Testing non-existent URL:');
    const nonexistentResult = await sanity.uploadClientLogoWithAVIF(
      'https://nonexistent-domain-12345.com/image.jpg',
      'Test Non-existent URL'
    );
    console.log(`   Result: ${JSON.stringify(nonexistentResult, null, 2)}`);

    console.log('\n✅ Failed logo handling test completed successfully!');
    
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
    await testFailedLogoHandling();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('test-failed-logos.js')) {
  main();
}
