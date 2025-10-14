/**
 * Read.ai Webhook Handler for Meeting Notes
 * 
 * This script handles incoming webhooks from Read.ai and creates structured Notion pages.
 * It processes meeting data, transcripts, and creates organized meeting notes automatically.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import NotionClient from './notion-client.js';
import SlackNotificationManager from './slack-notifications.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * ReadAIWebhookHandler class processes Read.ai webhooks and creates Notion pages
 * with meeting data, transcripts, and structured information.
 */
class ReadAIWebhookHandler {
  /**
   * Initialize the webhook handler with Notion client
   * @constructor
   */
  constructor() {
    this.notion = new NotionClient();
    this.slackNotifications = new SlackNotificationManager();
  }

  /**
   * Process incoming Read.ai webhook payload and create Notion page
   * @async
   * @function processWebhook
   * @param {Object} webhookData - The webhook payload from Read.ai
   * @param {string} webhookData.session_id - Unique session identifier
   * @param {string} webhookData.trigger - Webhook trigger type
   * @param {string} webhookData.title - Meeting title
   * @param {string} webhookData.start_time - Meeting start time (ISO format)
   * @param {string} webhookData.end_time - Meeting end time (ISO format)
   * @param {string[]} webhookData.participants - Array of participant names
   * @param {string} webhookData.owner - Meeting owner
   * @param {string} webhookData.summary - Meeting summary
   * @param {string[]} webhookData.action_items - Array of action items
   * @param {string[]} webhookData.key_questions - Array of key questions
   * @param {string[]} webhookData.topics - Array of topics covered
   * @param {string} webhookData.report_url - URL to Read.ai report
   * @param {string} webhookData.transcript - Full meeting transcript
   * @returns {Promise<Object>} Result object with success status and details
   */
  async processWebhook(webhookData, headers = null, source = "Express Server") {
    const startTime = Date.now();
    
    try {
      console.log('🔔 Processing Read.ai webhook...');
      console.log('📊 Webhook data:', JSON.stringify(webhookData, null, 2));

      // Send webhook received notification
      await this.slackNotifications.notifyWebhookReceived({
        webhookData,
        headers,
        source
      });

      // Validate webhook data
      const validationResult = this.validateWebhookData(webhookData);
      
      // Send meeting validation notification
      await this.slackNotifications.notifyMeetingValidation({
        webhookData,
        isValid: validationResult.isValid,
        missingFields: validationResult.missingFields,
        trigger: webhookData.trigger
      });

      if (!validationResult.isValid) {
        throw new Error(`Invalid webhook data: ${validationResult.missingFields.join(', ')}`);
      }

      // Create meeting page in Notion
      const result = await this.notion.createMeetingPage(webhookData);
      const duration = Date.now() - startTime;
      
      if (result) {
        console.log('✅ Meeting notes created successfully!');
        console.log('🆔 Notion page ID:', result.id);
        
        // Send Notion creation success notification
        await this.slackNotifications.notifyNotionCreation({
          success: true,
          notionPageId: result.id,
          webhookData,
          duration
        });
        
        return {
          success: true,
          notionPageId: result.id,
          message: 'Meeting notes created successfully'
        };
      } else {
        throw new Error('Failed to create meeting page in Notion');
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Error processing webhook:', error);
      
      // Send Notion creation failure notification
      await this.slackNotifications.notifyNotionCreation({
        success: false,
        webhookData,
        error,
        duration
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate webhook data structure
   */
  validateWebhookData(data) {
    const requiredFields = ['session_id', 'trigger', 'title'];
    const missingFields = [];
    
    for (const field of requiredFields) {
      if (!data[field]) {
        console.error(`❌ Missing required field: ${field}`);
        missingFields.push(field);
      }
    }

    // Check if trigger is meeting_end
    if (data.trigger !== 'meeting_end') {
      console.error(`❌ Invalid trigger: ${data.trigger}. Expected: meeting_end`);
      missingFields.push('trigger (must be meeting_end)');
    }

    const isValid = missingFields.length === 0;
    
    if (isValid) {
      console.log('✅ Webhook data validation passed');
    } else {
      console.log(`❌ Webhook data validation failed. Missing: ${missingFields.join(', ')}`);
    }
    
    return {
      isValid,
      missingFields
    };
  }

  /**
   * Test function to simulate webhook processing
   */
  async testWebhook() {
    console.log('🧪 Testing webhook processing with sample data...\n');
    
    // Sample webhook data based on Read.ai schema
    const sampleData = {
      session_id: 'test-session-123',
      trigger: 'meeting_end',
      title: 'Weekly Team Standup',
      start_time: '2024-01-15T10:00:00Z',
      end_time: '2024-01-15T10:30:00Z',
      participants: ['John Doe', 'Jane Smith', 'Bob Johnson'],
      owner: 'John Doe',
      summary: 'Discussed project progress, upcoming deadlines, and resource allocation.',
      action_items: [
        'John to complete the API documentation by Friday',
        'Jane to review the design mockups',
        'Bob to schedule client meeting for next week'
      ],
      key_questions: [
        'What are the main blockers for the current sprint?',
        'Do we need additional resources for the upcoming project?'
      ],
      topics: ['Project Management', 'Sprint Planning', 'Resource Allocation'],
      report_url: 'https://read.ai/reports/test-session-123',
      transcript: `John Doe: Good morning everyone, let's start with our weekly standup.

Jane Smith: Morning John. I've completed the user interface design for the new feature and it's ready for review.

Bob Johnson: Hi team. I've been working on the backend integration and should have it ready by end of week.

John Doe: Great progress everyone. Any blockers we need to address?

Jane Smith: I need the API documentation to finalize the frontend integration.

Bob Johnson: I can provide that by Friday.

John Doe: Perfect. Let's schedule a client meeting for next week to present our progress.

Bob Johnson: I'll handle that scheduling.

John Doe: Excellent. That wraps up our standup. Let's keep the momentum going.`
    };

    const result = await this.processWebhook(sampleData);
    
    if (result.success) {
      console.log('✅ Test webhook processing successful!');
      console.log('📄 Created Notion page with ID:', result.notionPageId);
    } else {
      console.error('❌ Test webhook processing failed:', result.error);
    }

    return result;
  }

  /**
   * Test Notion connection
   */
  async testConnection() {
    console.log('🔗 Testing Notion connection...');
    return await this.notion.testConnection();
  }

  /**
   * Get database schema
   */
  async getDatabaseSchema() {
    console.log('📊 Getting database schema...');
    return await this.notion.getDatabaseSchema();
  }

  /**
   * Create meeting database if needed
   */
  async createDatabase() {
    console.log('🏗️ Creating meeting database...');
    return await this.notion.createMeetingDatabase();
  }
}

/**
 * Express.js webhook endpoint (for production use)
 * This would be used in a real webhook endpoint
 */
export function createWebhookEndpoint() {
  return async (req, res) => {
    try {
      const webhookHandler = new ReadAIWebhookHandler();
      const result = await webhookHandler.processWebhook(req.body);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Webhook processed successfully',
          notionPageId: result.notionPageId
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Webhook endpoint error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };
}

/**
 * Main function for testing
 */
async function main() {
  const webhookHandler = new ReadAIWebhookHandler();
  
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'test-connection':
        await webhookHandler.testConnection();
        break;
      case 'get-schema':
        await webhookHandler.getDatabaseSchema();
        break;
      case 'create-database':
        await webhookHandler.createDatabase();
        break;
      case 'test-webhook':
        await webhookHandler.testWebhook();
        break;
      default:
        console.log('Available commands:');
        console.log('  test-connection  - Test Notion connection');
        console.log('  get-schema      - Get database schema');
        console.log('  create-database - Create meeting database');
        console.log('  test-webhook    - Test webhook processing');
        break;
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('read-ai-webhook.js')) {
  main();
}

export default ReadAIWebhookHandler;
