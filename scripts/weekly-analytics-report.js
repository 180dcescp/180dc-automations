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

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate and send weekly analytics report
 */
async function generateWeeklyReport() {
  console.log('📊 Generating Weekly Analytics Report...\n');
  
  // Initialize Google Analytics client
  const analytics = new BetaAnalyticsDataClient({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      project_id: process.env.GOOGLE_PROJECT_ID
    }
  });
  
  const propertyId = process.env.GOOGLE_ANALYTICS_ID || 'G-XXXXXXXXXX';
  const isEnabled = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_PROJECT_ID);
  
  if (!isEnabled) {
    throw new Error('Google Analytics not configured - missing credentials');
  }
  
  // Initialize Slack client
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  const slackChannel = process.env.SLACK_CHANNEL || '#automation-updates';
  const slackEnabled = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL);
  
  try {
    // Test connections first
    console.log('🔍 Testing connections...');
    const analyticsConnected = await testAnalyticsConnection(analytics, propertyId);
    
    if (!analyticsConnected) {
      throw new Error('Google Analytics connection failed');
    }
    
    console.log('✅ All connections successful!\n');
    
    // Fetch analytics data
    console.log('📈 Fetching analytics data...');
    const report = await getWeeklyReport(analytics, propertyId);
    
    // Format the report for Slack
    const reportMessage = formatAnalyticsReport(report);
    
    // Send notification
    console.log('📤 Sending weekly analytics report to Slack...');
    await sendSlackMessage(slack, slackChannel, slackEnabled, {
      title: 'Weekly Website Performance Report',
      message: reportMessage,
      level: 'info'
    });
    
    console.log('✅ Weekly analytics report sent successfully!');
    
  } catch (error) {
    console.error('❌ Error generating weekly report:', error);
    
    // Send failure notification
    await sendSlackMessage(slack, slackChannel, slackEnabled, {
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

/**
 * Test connection to Google Analytics
 */
async function testAnalyticsConnection(analytics, propertyId) {
  try {
    const dateRange = getDateRange();
    await getBasicMetrics(analytics, propertyId, dateRange.currentWeek.startDate, dateRange.currentWeek.endDate);
    console.log('✅ Google Analytics connection successful');
    return true;
  } catch (error) {
    console.error('❌ Google Analytics connection failed:', error.message);
    return false;
  }
}

/**
 * Get date range for the past week
 */
function getDateRange() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  
  return {
    currentWeek: {
      startDate: oneWeekAgo.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    },
    previousWeek: {
      startDate: twoWeeksAgo.toISOString().split('T')[0],
      endDate: oneWeekAgo.toISOString().split('T')[0]
    }
  };
}

/**
 * Fetch basic metrics for a date range
 */
async function getBasicMetrics(analytics, propertyId, startDate, endDate) {
  try {
    const [response] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{
        startDate,
        endDate
      }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' }
      ]
    });

    const metrics = response.rows?.[0]?.metricValues || [];
    
    return {
      sessions: parseInt(metrics[0]?.value || '0'),
      totalUsers: parseInt(metrics[1]?.value || '0'),
      screenPageViews: parseInt(metrics[2]?.value || '0'),
      bounceRate: parseFloat(metrics[3]?.value || '0'),
      averageSessionDuration: parseFloat(metrics[4]?.value || '0')
    };
  } catch (error) {
    console.error('❌ Error fetching basic metrics:', error);
    throw error;
  }
}

/**
 * Fetch top pages
 */
async function getTopPages(analytics, propertyId, startDate, endDate, limit = 5) {
  try {
    const [response] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{
        startDate,
        endDate
      }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit
    });

    return response.rows?.map(row => ({
      path: row.dimensionValues?.[0]?.value || 'Unknown',
      views: parseInt(row.metricValues?.[0]?.value || '0')
    })) || [];
  } catch (error) {
    console.error('❌ Error fetching top pages:', error);
    return [];
  }
}

/**
 * Fetch traffic sources
 */
async function getTrafficSources(analytics, propertyId, startDate, endDate) {
  try {
    const [response] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{
        startDate,
        endDate
      }],
      dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
    });

    const totalSessions = response.rows?.reduce((sum, row) => 
      sum + parseInt(row.metricValues?.[0]?.value || '0'), 0) || 1;

    return response.rows?.map(row => ({
      source: row.dimensionValues?.[0]?.value || 'Unknown',
      sessions: parseInt(row.metricValues?.[0]?.value || '0'),
      percentage: Math.round((parseInt(row.metricValues?.[0]?.value || '0') / totalSessions) * 100)
    })) || [];
  } catch (error) {
    console.error('❌ Error fetching traffic sources:', error);
    return [];
  }
}

/**
 * Fetch top countries
 */
async function getTopCountries(analytics, propertyId, startDate, endDate, limit = 5) {
  try {
    const [response] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{
        startDate,
        endDate
      }],
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit
    });

    const totalSessions = response.rows?.reduce((sum, row) => 
      sum + parseInt(row.metricValues?.[0]?.value || '0'), 0) || 1;

    return response.rows?.map(row => ({
      country: row.dimensionValues?.[0]?.value || 'Unknown',
      sessions: parseInt(row.metricValues?.[0]?.value || '0'),
      percentage: Math.round((parseInt(row.metricValues?.[0]?.value || '0') / totalSessions) * 100)
    })) || [];
  } catch (error) {
    console.error('❌ Error fetching top countries:', error);
    return [];
  }
}

/**
 * Fetch device breakdown
 */
async function getDeviceBreakdown(analytics, propertyId, startDate, endDate) {
  try {
    const [response] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{
        startDate,
        endDate
      }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
    });

    const totalSessions = response.rows?.reduce((sum, row) => 
      sum + parseInt(row.metricValues?.[0]?.value || '0'), 0) || 1;

    return response.rows?.map(row => ({
      device: row.dimensionValues?.[0]?.value || 'Unknown',
      sessions: parseInt(row.metricValues?.[0]?.value || '0'),
      percentage: Math.round((parseInt(row.metricValues?.[0]?.value || '0') / totalSessions) * 100)
    })) || [];
  } catch (error) {
    console.error('❌ Error fetching device breakdown:', error);
    return [];
  }
}

/**
 * Get comprehensive weekly report
 */
async function getWeeklyReport(analytics, propertyId) {
  const dateRange = getDateRange();
  console.log('📊 Fetching weekly analytics report...');
  console.log(`📅 Current week: ${dateRange.currentWeek.startDate} to ${dateRange.currentWeek.endDate}`);
  console.log(`📅 Previous week: ${dateRange.previousWeek.startDate} to ${dateRange.previousWeek.endDate}`);

  try {
    // Fetch current week data
    const [currentMetrics, topPages, trafficSources, topCountries, deviceBreakdown] = await Promise.all([
      getBasicMetrics(analytics, propertyId, dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
      getTopPages(analytics, propertyId, dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
      getTrafficSources(analytics, propertyId, dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
      getTopCountries(analytics, propertyId, dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
      getDeviceBreakdown(analytics, propertyId, dateRange.currentWeek.startDate, dateRange.currentWeek.endDate)
    ]);

    // Fetch previous week data for comparison
    const previousMetrics = await getBasicMetrics(analytics, propertyId, dateRange.previousWeek.startDate, dateRange.previousWeek.endDate);

    // Calculate percentage changes
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    return {
      currentWeek: currentMetrics,
      previousWeek: previousMetrics,
      changes: {
        sessions: calculateChange(currentMetrics.sessions, previousMetrics.sessions),
        totalUsers: calculateChange(currentMetrics.totalUsers, previousMetrics.totalUsers),
        screenPageViews: calculateChange(currentMetrics.screenPageViews, previousMetrics.screenPageViews),
        bounceRate: calculateChange(currentMetrics.bounceRate, previousMetrics.bounceRate)
      },
      topPages,
      trafficSources,
      topCountries,
      deviceBreakdown,
      dateRange
    };
  } catch (error) {
    console.error('❌ Error generating weekly report:', error);
    throw error;
  }
}

/**
 * Send a message to Slack
 */
async function sendSlackMessage(slack, channel, enabled, { title, message, level }) {
  if (!enabled) {
    console.log('📱 Slack notification (disabled):', message);
    return;
  }

  try {
    const emoji = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '📊';
    const text = `${emoji} *${title}*\n\n${message}`;

    const result = await slack.chat.postMessage({
      channel: channel,
      text: text,
      unfurl_links: false,
      unfurl_media: false
    });

    console.log(`✅ Slack notification sent: ${result.ts}`);
    return result;
  } catch (error) {
    console.error('❌ Error sending Slack notification:', error);
    throw error;
  }
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
