#!/usr/bin/env node

/**
 * Weekly Analytics Report
 * 
 * This script generates a weekly Google Analytics report and sends it to Slack.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import GoogleAnalyticsClient from './google-analytics-client.js';
import SlackNotificationManager from './slack-notifications.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate and send weekly analytics report
 */
async function generateWeeklyReport() {
  console.log('📊 Generating Weekly Analytics Report...\n');
  
  const analytics = new GoogleAnalyticsClient();
  const notifications = new SlackNotificationManager();
  
  try {
    // Test connections first
    console.log('🔍 Testing connections...');
    const analyticsConnected = await analytics.testConnection();
    
    if (!analyticsConnected) {
      throw new Error('Google Analytics connection failed');
    }
    
    console.log('✅ All connections successful!\n');
    
    // Fetch analytics data
    console.log('📈 Fetching analytics data...');
    const report = await analytics.getWeeklyReport();
    
    // Format the report for Slack
    const reportMessage = formatAnalyticsReport(report);
    
    // Send notification
    console.log('📤 Sending weekly analytics report to Slack...');
    await notifications.notifyGeneric({
      title: 'Weekly Website Performance Report',
      message: reportMessage,
      level: 'info'
    });
    
    console.log('✅ Weekly analytics report sent successfully!');
    
  } catch (error) {
    console.error('❌ Error generating weekly report:', error);
    
    // Send failure notification
    await notifications.notifyGeneric({
      title: 'Weekly Analytics Report Failed',
      message: `Failed to generate weekly analytics report: ${error.message}`,
      level: 'error'
    });
    
    throw error;
  }
}

/**
 * Format analytics data into a readable Slack message
 */
function formatAnalyticsReport(report) {
  const { currentWeek, changes, topPages, trafficSources, topCountries, deviceBreakdown } = report;
  
  // Helper function to format numbers
  const formatNumber = (num) => num.toLocaleString();
  const formatPercentage = (num) => `${num > 0 ? '+' : ''}${num}%`;
  
  // Helper function to format duration
  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };
  
  let message = `📊 *Weekly Website Performance Report*\n\n`;
  
  // Overview section
  message += `📈 *Overview:*\n`;
  message += `• Page Views: ${formatNumber(currentWeek.screenPageViews)} (${formatPercentage(changes.screenPageViews)} vs last week)\n`;
  message += `• Unique Visitors: ${formatNumber(currentWeek.totalUsers)} (${formatPercentage(changes.totalUsers)} vs last week)\n`;
  message += `• Sessions: ${formatNumber(currentWeek.sessions)} (${formatPercentage(changes.sessions)} vs last week)\n`;
  message += `• Bounce Rate: ${currentWeek.bounceRate.toFixed(1)}% (${formatPercentage(changes.bounceRate)} vs last week)\n`;
  message += `• Avg Session Duration: ${formatDuration(currentWeek.averageSessionDuration)}\n\n`;
  
  // Top pages section
  if (topPages.length > 0) {
    message += `🏆 *Top Pages:*\n`;
    topPages.forEach((page, index) => {
      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
      message += `${emoji} ${page.path} - ${formatNumber(page.views)} views\n`;
    });
    message += `\n`;
  }
  
  // Traffic sources section
  if (trafficSources.length > 0) {
    message += `🌍 *Traffic Sources:*\n`;
    trafficSources.slice(0, 4).forEach(source => {
      message += `• ${source.source}: ${source.percentage}%\n`;
    });
    message += `\n`;
  }
  
  // Top countries section
  if (topCountries.length > 0) {
    message += `📍 *Top Countries:*\n`;
    topCountries.slice(0, 3).forEach(country => {
      message += `• ${country.country}: ${country.percentage}%\n`;
    });
    message += `\n`;
  }
  
  // Device breakdown section
  if (deviceBreakdown.length > 0) {
    message += `📱 *Device Breakdown:*\n`;
    deviceBreakdown.forEach(device => {
      message += `• ${device.device}: ${device.percentage}%\n`;
    });
    message += `\n`;
  }
  
  // Date range
  const startDate = new Date(report.dateRange.currentWeek.startDate).toLocaleDateString();
  const endDate = new Date(report.dateRange.currentWeek.endDate).toLocaleDateString();
  message += `⏰ *Time:* Week of ${startDate} - ${endDate}`;
  
  return message;
}

// Main execution
async function main() {
  await generateWeeklyReport();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('weekly-analytics-report.js')) {
  main().catch(console.error);
}

export default generateWeeklyReport;
