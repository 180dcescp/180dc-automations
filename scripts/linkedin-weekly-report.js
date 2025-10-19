#!/usr/bin/env node

/**
 * LinkedIn Weekly Report
 * 
 * This script generates a weekly LinkedIn organization analytics report and sends it to Slack.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2025-01-01
 */

import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate and send weekly LinkedIn report
 */
async function generateLinkedInReport() {
  console.log('📊 Generating LinkedIn Weekly Report...\n');
  
  // Initialize LinkedIn API client
  const linkedinClient = new LinkedInClient({
    clientId: process.env.LINKEDIN_ID,
    clientSecret: process.env.LINKEDIN_API_KEY
  });
  
  const orgId = process.env.LINKEDIN_ORG_ID;
  const isEnabled = !!(process.env.LINKEDIN_ID && process.env.LINKEDIN_API_KEY && process.env.LINKEDIN_ORG_ID);
  
  if (!isEnabled) {
    throw new Error('LinkedIn API not configured - missing credentials');
  }
  
  // Initialize Slack client
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  const slackChannel = process.env.SLACK_CHANNEL_MARKETING || '#marketing-updates';
  const slackEnabled = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_MARKETING);
  
  try {
    // Test connections first
    console.log('🔍 Testing connections...');
    const linkedinConnected = await testLinkedInConnection(linkedinClient, orgId);
    
    if (!linkedinConnected) {
      throw new Error('LinkedIn API connection failed');
    }
    
    console.log('✅ All connections successful!\n');
    
    // Fetch LinkedIn data
    console.log('📈 Fetching LinkedIn analytics data...');
    const report = await getLinkedInReport(linkedinClient, orgId);
    
    // Format the report for Slack
    const reportMessage = formatLinkedInReport(report);
    
    // Send notification
    console.log('📤 Sending LinkedIn weekly report to Slack...');
    await sendSlackMessage(slack, slackChannel, slackEnabled, {
      title: 'LinkedIn Weekly Performance Report',
      message: reportMessage,
      level: 'info'
    });
    
    console.log('✅ LinkedIn weekly report sent successfully!');
    
  } catch (error) {
    console.error('❌ Error generating LinkedIn report:', error);
    
    // Send failure notification
    await sendSlackMessage(slack, slackChannel, slackEnabled, {
      title: 'LinkedIn Weekly Report Failed',
      message: `Failed to generate LinkedIn weekly report: ${error.message}`,
      level: 'error'
    });
    
    throw error;
  }
}

/**
 * LinkedIn API Client
 */
class LinkedInClient {
  constructor({ clientId, clientSecret }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.baseUrl = 'https://api.linkedin.com/v2';
  }

  async authenticate() {
    if (this.accessToken) return this.accessToken;

    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`LinkedIn authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  async makeRequest(endpoint, params = {}) {
    await this.authenticate();
    
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (!response.ok) {
      throw new Error(`LinkedIn API request failed: ${response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Test connection to LinkedIn API
 */
async function testLinkedInConnection(linkedinClient, orgId) {
  try {
    await linkedinClient.makeRequest(`/organizations/${orgId}`);
    console.log('✅ LinkedIn API connection successful');
    return true;
  } catch (error) {
    console.error('❌ LinkedIn API connection failed:', error.message);
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
 * Fetch organization follower statistics
 */
async function getFollowerStats(linkedinClient, orgId) {
  try {
    const response = await linkedinClient.makeRequest(`/organizationalEntityFollowerStatistics`, {
      q: 'organizationalEntity',
      organizationalEntity: `urn:li:organization:${orgId}`,
      timeGranularity: 'MONTHLY',
      startTime: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // Last 30 days
      endTime: Math.floor(Date.now() / 1000)
    });

    return response.elements?.[0] || {};
  } catch (error) {
    console.error('❌ Error fetching follower stats:', error);
    return {};
  }
}

/**
 * Fetch organization share statistics
 */
async function getShareStats(linkedinClient, orgId) {
  try {
    const response = await linkedinClient.makeRequest(`/organizationalEntityShareStatistics`, {
      q: 'organizationalEntity',
      organizationalEntity: `urn:li:organization:${orgId}`,
      timeGranularity: 'MONTHLY',
      startTime: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // Last 30 days
      endTime: Math.floor(Date.now() / 1000)
    });

    return response.elements?.[0] || {};
  } catch (error) {
    console.error('❌ Error fetching share stats:', error);
    return {};
  }
}

/**
 * Fetch recent posts from organization
 */
async function getRecentPosts(linkedinClient, orgId) {
  try {
    const response = await linkedinClient.makeRequest(`/ugcPosts`, {
      q: 'authors',
      authors: `List(urn:li:organization:${orgId})`,
      count: 10
    });

    return response.elements || [];
  } catch (error) {
    console.error('❌ Error fetching recent posts:', error);
    return [];
  }
}

/**
 * Fetch comments for a specific post
 */
async function getPostComments(linkedinClient, postUrn) {
  try {
    const response = await linkedinClient.makeRequest(`/socialActions/${encodeURIComponent(postUrn)}/comments`, {
      count: 5
    });

    return response.elements || [];
  } catch (error) {
    console.error('❌ Error fetching post comments:', error);
    return [];
  }
}

/**
 * Get comprehensive LinkedIn report
 */
async function getLinkedInReport(linkedinClient, orgId) {
  const dateRange = getDateRange();
  console.log('📊 Fetching LinkedIn analytics report...');
  console.log(`📅 Current week: ${dateRange.currentWeek.startDate} to ${dateRange.currentWeek.endDate}`);

  try {
    // Fetch all data in parallel
    const [followerStats, shareStats, recentPosts] = await Promise.all([
      getFollowerStats(linkedinClient, orgId),
      getShareStats(linkedinClient, orgId),
      getRecentPosts(linkedinClient, orgId)
    ]);

    // Get comments for top posts
    const topPosts = recentPosts.slice(0, 3);
    const commentsPromises = topPosts.map(post => 
      getPostComments(linkedinClient, post.id)
    );
    const commentsResults = await Promise.all(commentsPromises);

    // Combine comments from all posts
    const allComments = commentsResults.flat();

    return {
      followerStats,
      shareStats,
      recentPosts: topPosts,
      comments: allComments.slice(0, 5), // Top 5 comments
      dateRange
    };
  } catch (error) {
    console.error('❌ Error generating LinkedIn report:', error);
    throw error;
  }
}

/**
 * Format LinkedIn data into a readable Slack message
 */
function formatLinkedInReport(report) {
  const { followerStats, shareStats, recentPosts, comments, dateRange } = report;
  
  // Helper function to format numbers
  const formatNumber = (num) => num ? num.toLocaleString() : 'N/A';
  
  let message = `📊 *LinkedIn Weekly Performance Report*\n\n`;
  
  // Overview section
  message += `📈 *Overview:*\n`;
  message += `• Total Followers: ${formatNumber(followerStats.followerCountsByAssociationType?.MEMBER?.organicFollowerCount)} (${formatNumber(followerStats.followerCountsByAssociationType?.MEMBER?.paidFollowerCount)} paid)\n`;
  message += `• Total Impressions: ${formatNumber(shareStats.impressionCount)}\n`;
  message += `• Total Clicks: ${formatNumber(shareStats.clickCount)}\n`;
  message += `• Engagement Rate: ${shareStats.engagement ? (shareStats.engagement * 100).toFixed(1) : 'N/A'}%\n\n`;
  
  // Top posts section
  if (recentPosts.length > 0) {
    message += `🏆 *Top Posts (Last 7 Days):*\n`;
    recentPosts.forEach((post, index) => {
      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
      const text = post.text?.text || 'No text content';
      const excerpt = text.length > 100 ? text.substring(0, 100) + '...' : text;
      message += `${emoji} ${excerpt}\n`;
    });
    message += `\n`;
  }
  
  // Comments section
  if (comments.length > 0) {
    message += `💬 *Recent Comments:*\n`;
    comments.forEach(comment => {
      const author = comment.actor?.name || 'Unknown';
      const text = comment.message?.text || 'No comment text';
      const excerpt = text.length > 80 ? text.substring(0, 80) + '...' : text;
      message += `• ${author}: "${excerpt}"\n`;
    });
    message += `\n`;
  }
  
  // Date range
  const startDate = new Date(dateRange.currentWeek.startDate).toLocaleDateString();
  const endDate = new Date(dateRange.currentWeek.endDate).toLocaleDateString();
  message += `⏰ *Time:* Week of ${startDate} - ${endDate}`;
  
  return message;
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
  await generateLinkedInReport();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('linkedin-weekly-report.js')) {
  main().catch(console.error);
}

export default generateLinkedInReport;
