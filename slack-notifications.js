#!/usr/bin/env node

/**
 * Slack Notification Utility
 * 
 * This utility provides comprehensive Slack notifications for all automation scripts,
 * deployments, and page builds. It includes success/failure notifications with detailed
 * error logging and summary information.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SlackNotificationManager class handles all Slack notifications
 * for automations, deployments, and page builds
 */
class SlackNotificationManager {
  constructor() {
    this.client = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.channel = process.env.SLACK_CHANNEL || '#automation-updates';
    this.isEnabled = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL);
    
    if (!this.isEnabled) {
      console.warn('⚠️ Slack notifications disabled - missing SLACK_BOT_TOKEN or SLACK_CHANNEL');
    }
  }

  /**
   * Send a notification for automation success
   * @param {Object} options - Notification options
   * @param {string} options.script - Script name
   * @param {string} options.summary - Summary of what was accomplished
   * @param {Object} options.results - Results object with counts
   * @param {number} options.duration - Duration in milliseconds
   */
  async notifyAutomationSuccess({ script, summary, results, duration }) {
    if (!this.isEnabled) return;

    const durationText = duration ? ` (${Math.round(duration / 1000)}s)` : '';
    let message = `✅ *${script} Completed Successfully*${durationText}\n\n`;
    message += `📊 *Summary:* ${summary}\n\n`;
    
    if (results) {
      message += `📈 *Results:*\n`;
      if (results.created) message += `• ✅ Created: ${results.created}\n`;
      if (results.updated) message += `• 🔄 Updated: ${results.updated}\n`;
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

    await this.sendMessage(message, blocks);
  }

  /**
   * Send a notification for automation failure
   * @param {Object} options - Notification options
   * @param {string} options.script - Script name
   * @param {Error} options.error - Error object
   * @param {string} options.context - Additional context
   * @param {Object} options.partialResults - Any partial results before failure
   */
  async notifyAutomationFailure({ script, error, context, partialResults }) {
    if (!this.isEnabled) return;

    let message = `❌ *${script} Failed*\n\n`;
    message += `🚨 *Error:* ${error.message}\n`;
    
    if (context) {
      message += `📝 *Context:* ${context}\n`;
    }

    if (partialResults) {
      message += `\n📊 *Partial Results:*\n`;
      if (partialResults.created) message += `• ✅ Created: ${partialResults.created}\n`;
      if (partialResults.updated) message += `• 🔄 Updated: ${partialResults.updated}\n`;
      if (partialResults.processed) message += `• 📊 Processed: ${partialResults.processed}\n`;
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

    await this.sendMessage(message, blocks);
  }

  /**
   * Send a notification for deployment success
   * @param {Object} options - Notification options
   * @param {string} options.service - Service name (e.g., "Website", "Webhook")
   * @param {string} options.platform - Deployment platform
   * @param {string} options.url - Deployment URL
   * @param {number} options.duration - Duration in milliseconds
   */
  async notifyDeploymentSuccess({ service, platform, url, duration }) {
    if (!this.isEnabled) return;

    const durationText = duration ? ` (${Math.round(duration / 1000)}s)` : '';
    let message = `🚀 *${service} Deployment Successful*${durationText}\n\n`;
    message += `🌐 *Platform:* ${platform}\n`;
    
    if (url) {
      message += `🔗 *URL:* ${url}\n`;
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

    await this.sendMessage(message, blocks);
  }

  /**
   * Send a notification for deployment failure
   * @param {Object} options - Notification options
   * @param {string} options.service - Service name
   * @param {string} options.platform - Deployment platform
   * @param {Error} options.error - Error object
   * @param {string} options.logs - Deployment logs
   */
  async notifyDeploymentFailure({ service, platform, error, logs }) {
    if (!this.isEnabled) return;

    let message = `❌ *${service} Deployment Failed*\n\n`;
    message += `🌐 *Platform:* ${platform}\n`;
    message += `🚨 *Error:* ${error.message}\n`;

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

    // Add error details and logs
    if (error.stack) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Details:*\n\`\`\`\n${error.stack}\n\`\`\``
        }
      });
    }

    if (logs) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Deployment Logs:*\n\`\`\`\n${logs}\n\`\`\``
        }
      });
    }

    await this.sendMessage(message, blocks);
  }

  /**
   * Send a notification for page build success
   * @param {Object} options - Notification options
   * @param {string} options.page - Page name
   * @param {string} options.url - Page URL
   * @param {number} options.duration - Duration in milliseconds
   */
  async notifyPageBuildSuccess({ page, url, duration }) {
    if (!this.isEnabled) return;

    const durationText = duration ? ` (${Math.round(duration / 1000)}s)` : '';
    let message = `📄 *${page} Build Successful*${durationText}\n\n`;
    
    if (url) {
      message += `🔗 *URL:* ${url}\n`;
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

    await this.sendMessage(message, blocks);
  }

  /**
   * Send a notification for page build failure
   * @param {Object} options - Notification options
   * @param {string} options.page - Page name
   * @param {Error} options.error - Error object
   * @param {string} options.logs - Build logs
   */
  async notifyPageBuildFailure({ page, error, logs }) {
    if (!this.isEnabled) return;

    let message = `❌ *${page} Build Failed*\n\n`;
    message += `🚨 *Error:* ${error.message}\n`;

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

    // Add error details and logs
    if (error.stack) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Details:*\n\`\`\`\n${error.stack}\n\`\`\``
        }
      });
    }

    if (logs) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Build Logs:*\n\`\`\`\n${logs}\n\`\`\``
        }
      });
    }

    await this.sendMessage(message, blocks);
  }

  /**
   * Send a notification for webhook processing
   * @param {Object} options - Notification options
   * @param {string} options.status - Success or failure
   * @param {string} options.webhookType - Type of webhook
   * @param {Object} options.data - Webhook data
   * @param {Error} options.error - Error if failed
   */
  async notifyWebhookProcessing({ status, webhookType, data, error }) {
    if (!this.isEnabled) return;

    const isSuccess = status === 'success';
    const emoji = isSuccess ? '✅' : '❌';
    const statusText = isSuccess ? 'Processed Successfully' : 'Failed';

    let message = `${emoji} *${webhookType} Webhook ${statusText}*\n\n`;
    
    if (data) {
      message += `📊 *Data:*\n`;
      if (data.session_id) message += `• Session ID: ${data.session_id}\n`;
      if (data.title) message += `• Title: ${data.title}\n`;
      if (data.participants) message += `• Participants: ${Array.isArray(data.participants) ? data.participants.join(', ') : data.participants}\n`;
    }

    if (error) {
      message += `\n🚨 *Error:* ${error.message}\n`;
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

    // Add error details if failed
    if (error && error.stack) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Details:*\n\`\`\`\n${error.stack}\n\`\`\``
        }
      });
    }

    await this.sendMessage(message, blocks);
  }

  /**
   * Send a generic notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} level - Notification level (info, success, warning, error)
   */
  async notifyGeneric({ title, message, level = 'info' }) {
    if (!this.isEnabled) return;

    const emojis = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    const emoji = emojis[level] || 'ℹ️';
    const fullMessage = `${emoji} *${title}*\n\n${message}\n\n⏰ *Time:* ${new Date().toLocaleString()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: fullMessage
        }
      }
    ];

    await this.sendMessage(fullMessage, blocks);
  }

  /**
   * Send a message to Slack
   * @param {string} text - Message text
   * @param {Array} blocks - Slack blocks (optional)
   */
  async sendMessage(text, blocks = null) {
    if (!this.isEnabled) {
      console.log('📱 Slack notification (disabled):', text);
      return;
    }

    try {
      const payload = {
        channel: this.channel,
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

  /**
   * Test the Slack connection
   */
  async testConnection() {
    if (!this.isEnabled) {
      console.log('⚠️ Slack notifications are disabled');
      return false;
    }

    try {
      const result = await this.client.auth.test();
      console.log('✅ Slack connection successful');
      console.log(`Bot: ${result.user}`);
      console.log(`Team: ${result.team}`);
      return true;
    } catch (error) {
      console.error('❌ Slack connection failed:', error.message);
      return false;
    }
  }

  /**
   * Get channel information
   */
  async getChannelInfo() {
    if (!this.isEnabled) return null;

    try {
      const result = await this.client.conversations.info({
        channel: this.channel
      });
      return result.channel;
    } catch (error) {
      console.error('Error getting channel info:', error);
      return null;
    }
  }

  /**
   * Send notification for clients with failed logo conversions
   * @param {Array} failedLogos - Array of failed logo objects
   */
  async notifyFailedLogos(failedLogos) {
    if (!this.isEnabled || !failedLogos || failedLogos.length === 0) return;

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

      const result = await this.client.chat.postMessage({
        channel: this.channel,
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
   * Send notification for team members with failed avatar conversions
   * @param {Array} failedAvatars - Array of failed avatar objects
   */
  async notifyFailedAvatars(failedAvatars) {
    if (!this.isEnabled || !failedAvatars || failedAvatars.length === 0) return;

    try {
      let message = `⚠️ *Team Member Avatar Conversion Failures*\n\n`;
      message += `The following team members were excluded from sync due to avatar conversion failures:\n\n`;

      failedAvatars.forEach((failedAvatar, index) => {
        message += `${index + 1}. *${failedAvatar.name}*\n`;
        message += `   • Avatar URL: ${failedAvatar.avatarUrl}\n`;
        message += `   • Error: ${failedAvatar.error}\n\n`;
      });

      message += `🔧 *Action Required:*\n`;
      message += `Please ask these team members to update their Slack profile pictures with valid image formats (JPEG, PNG, WebP, GIF, BMP, TIFF).\n\n`;
      message += `💡 *Tip:* Ensure the profile pictures are publicly accessible and point to actual image files.`;

      const result = await this.client.chat.postMessage({
        channel: this.channel,
        text: 'Team Member Avatar Conversion Failures',
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

      console.log('✅ Failed avatars notification sent to Slack');
      return result;
    } catch (error) {
      console.error('❌ Error sending failed avatars notification:', error);
      return null;
    }
  }

  /**
   * Send debugging notification for webhook reception
   * @param {Object} options - Debug options
   * @param {Object} options.webhookData - Raw webhook data
   * @param {Object} options.headers - Request headers
   * @param {string} options.source - Source of webhook (e.g., "Cloudflare Worker", "Express Server")
   */
  async notifyWebhookReceived({ webhookData, headers, source = "Unknown" }) {
    if (!this.isEnabled) return;

    try {
      let message = `🔔 *Read.ai Webhook Received*\n\n`;
      message += `📡 *Source:* ${source}\n`;
      message += `⏰ *Time:* ${new Date().toLocaleString()}\n\n`;
      
      message += `📊 *Webhook Data:*\n`;
      if (webhookData.session_id) message += `• Session ID: \`${webhookData.session_id}\`\n`;
      if (webhookData.trigger) message += `• Trigger: \`${webhookData.trigger}\`\n`;
      if (webhookData.title) message += `• Title: ${webhookData.title}\n`;
      if (webhookData.start_time) message += `• Start Time: ${webhookData.start_time}\n`;
      if (webhookData.end_time) message += `• End Time: ${webhookData.end_time}\n`;
      if (webhookData.participants) {
        const participants = Array.isArray(webhookData.participants) ? webhookData.participants : [webhookData.participants];
        message += `• Participants: ${participants.join(', ')}\n`;
      }
      if (webhookData.owner) message += `• Owner: ${webhookData.owner}\n`;

      // Check for meeting data presence
      const hasMeetingData = webhookData.session_id && webhookData.trigger && webhookData.title;
      message += `\n🔍 *Meeting Detection:* ${hasMeetingData ? '✅ Meeting data present' : '❌ Missing meeting data'}\n`;

      if (headers) {
        message += `\n📋 *Headers:*\n`;
        if (headers['user-agent']) message += `• User-Agent: ${headers['user-agent']}\n`;
        if (headers['content-type']) message += `• Content-Type: ${headers['content-type']}\n`;
        if (headers['x-forwarded-for']) message += `• X-Forwarded-For: ${headers['x-forwarded-for']}\n`;
      }

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ];

      await this.sendMessage(message, blocks);
    } catch (error) {
      console.error('❌ Error sending webhook received notification:', error);
    }
  }

  /**
   * Send debugging notification for meeting data validation
   * @param {Object} options - Validation options
   * @param {Object} options.webhookData - Webhook data being validated
   * @param {boolean} options.isValid - Whether validation passed
   * @param {Array} options.missingFields - Array of missing required fields
   * @param {string} options.trigger - Webhook trigger type
   */
  async notifyMeetingValidation({ webhookData, isValid, missingFields = [], trigger }) {
    if (!this.isEnabled) return;

    try {
      const emoji = isValid ? '✅' : '❌';
      const statusText = isValid ? 'Meeting Data Valid' : 'Meeting Data Invalid';
      
      let message = `${emoji} *${statusText}*\n\n`;
      message += `📊 *Session ID:* \`${webhookData.session_id || 'Missing'}\`\n`;
      message += `🎯 *Trigger:* \`${trigger || 'Missing'}\`\n`;
      message += `📝 *Title:* ${webhookData.title || 'Missing'}\n`;

      if (!isValid && missingFields.length > 0) {
        message += `\n❌ *Missing Required Fields:*\n`;
        missingFields.forEach(field => {
          message += `• ${field}\n`;
        });
      }

      // Check if trigger is correct for meeting processing
      const isCorrectTrigger = trigger === 'meeting_end';
      message += `\n🔍 *Trigger Validation:* ${isCorrectTrigger ? '✅ Correct trigger (meeting_end)' : '❌ Wrong trigger (expected: meeting_end)'}\n`;

      // Check for additional meeting data
      const hasParticipants = webhookData.participants && (Array.isArray(webhookData.participants) ? webhookData.participants.length > 0 : webhookData.participants);
      const hasSummary = webhookData.summary && webhookData.summary.trim().length > 0;
      const hasTranscript = webhookData.transcript && webhookData.transcript.trim().length > 0;
      
      message += `\n📋 *Additional Data:*\n`;
      message += `• Participants: ${hasParticipants ? '✅ Present' : '❌ Missing'}\n`;
      message += `• Summary: ${hasSummary ? '✅ Present' : '❌ Missing'}\n`;
      message += `• Transcript: ${hasTranscript ? '✅ Present' : '❌ Missing'}\n`;

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

      await this.sendMessage(message, blocks);
    } catch (error) {
      console.error('❌ Error sending meeting validation notification:', error);
    }
  }

  /**
   * Send debugging notification for Notion database creation
   * @param {Object} options - Creation options
   * @param {boolean} options.success - Whether creation was successful
   * @param {string} options.notionPageId - Notion page ID if successful
   * @param {Object} options.webhookData - Original webhook data
   * @param {Error} options.error - Error if failed
   * @param {number} options.duration - Processing duration in milliseconds
   */
  async notifyNotionCreation({ success, notionPageId, webhookData, error, duration }) {
    if (!this.isEnabled) return;

    try {
      const emoji = success ? '✅' : '❌';
      const statusText = success ? 'Notion Page Created Successfully' : 'Notion Page Creation Failed';
      const durationText = duration ? ` (${Math.round(duration)}ms)` : '';
      
      let message = `${emoji} *${statusText}*${durationText}\n\n`;
      
      if (success) {
        message += `🆔 *Notion Page ID:* \`${notionPageId}\`\n`;
        message += `📝 *Meeting Title:* ${webhookData.title || 'Unknown'}\n`;
        message += `📊 *Session ID:* \`${webhookData.session_id || 'Unknown'}\`\n`;
        
        if (webhookData.participants) {
          const participants = Array.isArray(webhookData.participants) ? webhookData.participants : [webhookData.participants];
          message += `👥 *Participants:* ${participants.join(', ')}\n`;
        }
        
        if (webhookData.start_time && webhookData.end_time) {
          message += `⏰ *Duration:* ${webhookData.start_time} → ${webhookData.end_time}\n`;
        }
        
        message += `\n🔗 *Notion Link:* https://notion.so/${notionPageId.replace(/-/g, '')}\n`;
      } else {
        message += `🚨 *Error:* ${error.message}\n`;
        message += `📝 *Meeting Title:* ${webhookData.title || 'Unknown'}\n`;
        message += `📊 *Session ID:* \`${webhookData.session_id || 'Unknown'}\`\n`;
        
        if (error.stack) {
          message += `\n🔍 *Error Details:*\n\`\`\`\n${error.stack.substring(0, 500)}...\n\`\`\``;
        }
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

      await this.sendMessage(message, blocks);
    } catch (error) {
      console.error('❌ Error sending Notion creation notification:', error);
    }
  }
}

export default SlackNotificationManager;
