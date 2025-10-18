/**
 * Cloudflare Worker for Read.ai Webhook Integration
 * This runs on Cloudflare Workers and handles Read.ai webhooks
 * Updated for Notion API version 2025-09-03 with multi-source database support
 */

// Environment variables (set in Cloudflare Workers dashboard)
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2025-09-03';

/**
 * Handle incoming requests
 */
export default {
  async fetch(request, env, ctx) {
    // Get environment variables from Cloudflare Workers secrets
    const NOTION_TOKEN = env.NOTION_TOKEN;
    const MEETING_DATABASE_ID = env.MEETING_DATABASE_ID;
    const SLACK_BOT_TOKEN = env.SLACK_BOT_TOKEN;
    const SLACK_CHANNEL = env.SLACK_CHANNEL;
    const url = new URL(request.url);
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'Read.ai Webhook Handler (Cloudflare Worker)'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Removed test/dev endpoints in production worker

      // Main webhook endpoint
      if (url.pathname === '/webhook/read-ai' && method === 'POST') {
        try {
          const webhookData = await request.json();
          console.log('🔔 Received webhook from Read.ai:', JSON.stringify(webhookData, null, 2));
          
          // Send webhook received notification
          await sendWebhookReceivedNotification({
            webhookData,
            headers: Object.fromEntries(request.headers.entries()),
            source: "Cloudflare Worker",
            slackToken: SLACK_BOT_TOKEN,
            slackChannel: SLACK_CHANNEL
          });
          
          const result = await processWebhook(webhookData, NOTION_TOKEN, MEETING_DATABASE_ID, SLACK_BOT_TOKEN, SLACK_CHANNEL);
          
          console.log('📊 Webhook result:', JSON.stringify(result, null, 2));
          
          // Send enhanced Slack notification
          await sendSlackNotification({
            status: result.success ? 'success' : 'failure',
            webhookType: 'Read.ai',
            data: webhookData,
            error: result.success ? null : new Error(result.error),
            slackToken: SLACK_BOT_TOKEN,
            slackChannel: SLACK_CHANNEL
          });
          
          // Return a simple success response for Read.ai
          if (result.success) {
            return new Response(JSON.stringify({
              status: 'success',
              message: 'Webhook processed successfully'
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          } else {
            return new Response(JSON.stringify({
              status: 'error',
              message: result.error
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
        } catch (error) {
          console.error('❌ Error parsing webhook data:', error);
          
          // Send Slack notification for parsing error
          await sendSlackNotification({
            status: 'failure',
            webhookType: 'Read.ai',
            data: null,
            error: error,
            slackToken: SLACK_BOT_TOKEN,
            slackChannel: SLACK_CHANNEL
          });
          
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid JSON payload',
            timestamp: new Date().toISOString()
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }

      // 404 for unknown endpoints
      return new Response(JSON.stringify({
        success: false,
        error: 'Endpoint not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

// Removed test helpers

/**
 * Get data source ID from database ID (required for 2025-09-03 API)
 */
async function getDataSourceId(databaseId, NOTION_TOKEN) {
  try {
    console.log(`🔍 Getting data source ID for database: ${databaseId}`);
    
    const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_API_VERSION
      }
    });

    if (response.ok) {
      const database = await response.json();
      console.log('📊 Database response:', JSON.stringify(database, null, 2));
      
      if (database.data_sources && database.data_sources.length > 0) {
        const dataSourceId = database.data_sources[0].id;
        console.log(`✅ Found data source ID: ${dataSourceId}`);
        return dataSourceId;
      } else {
        console.error('❌ No data sources found in database');
        return null;
      }
    } else {
      const error = await response.text();
      console.error('❌ Failed to get database info:', error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting data source ID:', error);
    return null;
  }
}

//

//

/**
 * Process Read.ai webhook
 */
async function processWebhook(webhookData, NOTION_TOKEN, MEETING_DATABASE_ID, SLACK_BOT_TOKEN, SLACK_CHANNEL) {
  const startTime = Date.now();
  
  try {
    console.log('🔔 Processing Read.ai webhook in Cloudflare Worker');
    console.log('📊 Webhook data:', JSON.stringify(webhookData, null, 2));

    // Validate webhook data
    const validationResult = validateWebhookData(webhookData);
    
    // Send meeting validation notification
    await sendMeetingValidationNotification({
      webhookData,
      isValid: validationResult.isValid,
      missingFields: validationResult.missingFields,
      trigger: webhookData.trigger,
      slackToken: SLACK_BOT_TOKEN,
      slackChannel: SLACK_CHANNEL
    });
    
    if (!validationResult.isValid) {
      console.error('❌ Webhook validation failed');
      return {
        success: false,
        error: `Invalid webhook data - missing required fields: ${validationResult.missingFields.join(', ')}`,
        timestamp: new Date().toISOString()
      };
    }

    // Create meeting page in Notion
    const result = await createMeetingPage(webhookData, NOTION_TOKEN, MEETING_DATABASE_ID);
    const duration = Date.now() - startTime;
    
    if (result) {
      console.log('✅ Meeting notes created successfully!');
      
      // Send Notion creation success notification
      await sendNotionCreationNotification({
        success: true,
        notionPageId: result.id,
        webhookData,
        duration,
        slackToken: SLACK_BOT_TOKEN,
        slackChannel: SLACK_CHANNEL
      });
      
      return {
        success: true,
        notionPageId: result.id,
        message: 'Meeting notes created successfully',
        timestamp: new Date().toISOString()
      };
    } else {
      console.error('❌ Failed to create meeting page in Notion');
      
      // Send Notion creation failure notification
      await sendNotionCreationNotification({
        success: false,
        webhookData,
        error: new Error('Failed to create meeting page in Notion'),
        duration,
        slackToken: SLACK_BOT_TOKEN,
        slackChannel: SLACK_CHANNEL
      });
      
      return {
        success: false,
        error: 'Failed to create meeting page in Notion',
        timestamp: new Date().toISOString()
      };
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Error processing webhook:', error);
    
    // Send Notion creation failure notification
    await sendNotionCreationNotification({
      success: false,
      webhookData,
      error,
      duration,
      slackToken: SLACK_BOT_TOKEN,
      slackChannel: SLACK_CHANNEL
    });
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Validate webhook data
 */
function validateWebhookData(data) {
  console.log('🔍 Validating webhook data:', JSON.stringify(data, null, 2));
  
  const missingFields = [];
  
  // Check if data exists
  if (!data || typeof data !== 'object') {
    console.error('❌ Invalid webhook data: not an object');
    return {
      isValid: false,
      missingFields: ['data (not an object)']
    };
  }

  // Check for required fields (more flexible)
  const hasSessionId = data.session_id || data.sessionId || data.id;
  const hasTrigger = data.trigger || data.event;
  const hasTitle = data.title || data.meeting_title || data.name;

  if (!hasSessionId) {
    console.error('❌ Missing session ID field');
    missingFields.push('session_id');
  }

  if (!hasTrigger) {
    console.error('❌ Missing trigger field');
    missingFields.push('trigger');
  }

  if (!hasTitle) {
    console.error('❌ Missing title field');
    missingFields.push('title');
  }

  // Check trigger value (more flexible)
  if (hasTrigger) {
    const trigger = hasTrigger.toLowerCase();
    if (trigger !== 'meeting_end' && trigger !== 'meeting_end' && trigger !== 'end') {
      console.error(`❌ Invalid trigger: ${hasTrigger}. Expected: meeting_end`);
      missingFields.push('trigger (must be meeting_end)');
    }
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
 * Create meeting page in Notion (updated for 2025-09-03 API)
 */
async function createMeetingPage(meetingData, NOTION_TOKEN, MEETING_DATABASE_ID) {
  try {
    console.log(`📝 Creating meeting page for: ${meetingData.title}`);
    
    // Get data source ID first (required for 2025-09-03 API)
    const dataSourceId = await getDataSourceId(MEETING_DATABASE_ID, NOTION_TOKEN);
    if (!dataSourceId) {
      console.error('❌ Could not get data source ID for database');
      return null;
    }
    
    // Format arrays as text (handle Read.ai object format)
    const participantsText = Array.isArray(meetingData.participants) 
      ? meetingData.participants.map(p => p.name || p).join(', ') 
      : meetingData.participants || meetingData.attendees || '';

    const actionItemsText = Array.isArray(meetingData.action_items) 
      ? meetingData.action_items.map(item => item.text || item).join('\n• ') 
      : meetingData.action_items || meetingData.actions || '';

    const keyQuestionsText = Array.isArray(meetingData.key_questions) 
      ? meetingData.key_questions.map(q => q.text || q).join('\n• ') 
      : meetingData.key_questions || meetingData.questions || '';

    const topicsText = Array.isArray(meetingData.topics) 
      ? meetingData.topics.map(t => t.text || t).join(', ') 
      : meetingData.topics || meetingData.subjects || '';

    // Handle owner object
    const ownerText = meetingData.owner ? 
      (meetingData.owner.name || meetingData.owner) : 
      '';

    // Handle transcript
    const transcriptText = meetingData.transcript ? 
      (meetingData.transcript.speaker_blocks ? 
        meetingData.transcript.speaker_blocks.map(block => 
          `${block.speaker.name}: ${block.words}`
        ).join('\n') : 
        meetingData.transcript) : 
      '';

    // Extract date only from start_time
    const meetingDate = meetingData.start_time ? 
      meetingData.start_time.split('T')[0] : 
      new Date().toISOString().split('T')[0];

    const pageData = {
      parent: {
        type: 'data_source_id',
        data_source_id: dataSourceId
      },
      properties: {
        'Meeting Title': {
          title: [
            {
              text: {
                content: meetingData.title || 'Untitled Meeting'
              }
            }
          ]
        }
      }
    };

    // Map to actual database fields with correct types
    if (meetingDate) {
      pageData.properties['Date'] = {
        date: {
          start: meetingDate
        }
      };
    }

    if (participantsText) {
      // Split participants into array for multi_select
      const participantsArray = participantsText.split(', ').map(p => ({ name: p.trim() }));
      pageData.properties['Participants'] = {
        multi_select: participantsArray
      };
    }

    if (meetingData.summary) {
      pageData.properties['Summary'] = {
        rich_text: [
          {
            text: {
              content: meetingData.summary
            }
          }
        ]
      };
    }

    if (meetingData.report_url) {
      pageData.properties['Report URL'] = {
        url: meetingData.report_url
      };
    }

    if (topicsText) {
      // Split topics into array for multi_select
      const topicsArray = topicsText.split(', ').map(t => ({ name: t.trim() }));
      pageData.properties['Topics'] = {
        multi_select: topicsArray
      };
    }

    // Add Type field detection (Project or Exec) - case insensitive
    if (meetingData.title) {
      const lowerTitle = meetingData.title.toLowerCase();
      if (lowerTitle.includes('(project)') || lowerTitle.includes('(projects)')) {
        pageData.properties['Type'] = {
          select: { name: 'Project' }
        };
      } else {
        // Default to Exec for all other meetings
        pageData.properties['Type'] = {
          select: { name: 'Exec' }
        };
      }
    } else {
      // Default to Exec if no title
      pageData.properties['Type'] = {
        select: { name: 'Exec' }
      };
    }


    console.log('📊 Page data being sent to Notion:', JSON.stringify(pageData, null, 2));

    // Always create new pages - never update existing entries
    const response = await fetch(`${NOTION_API_BASE}/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION
      },
      body: JSON.stringify(pageData)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Meeting page created successfully!');
      console.log('🆔 Page ID:', result.id);
      
      // Add transcript as page content
      if (transcriptText) {
        await addTranscriptToPage(result.id, transcriptText, NOTION_TOKEN);
      }
      
      return result;
    } else {
      const error = await response.text();
      console.error('❌ Failed to create meeting page:', error);
      console.error('❌ Response status:', response.status);
      console.error('❌ Response headers:', Object.fromEntries(response.headers.entries()));
      return null;
    }
  } catch (error) {
    console.error('❌ Error creating meeting page:', error);
    return null;
  }
}

/**
 * Add transcript to page
 */
async function addTranscriptToPage(pageId, transcript, NOTION_TOKEN) {
  try {
    console.log('📄 Adding transcript to page...');
    
    // Split transcript into chunks
    const maxChunkSize = 2000;
    const transcriptChunks = chunkText(transcript, maxChunkSize);
    
    const blocks = transcriptChunks.map(chunk => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: chunk
            }
          }
        ]
      }
    }));

    // Add header
    const headerBlock = {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: 'Meeting Transcript'
            }
          }
        ]
      }
    };

    const allBlocks = [headerBlock, ...blocks];

    const response = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION
      },
      body: JSON.stringify({
        children: allBlocks
      })
    });

    if (response.ok) {
      console.log('✅ Transcript added successfully!');
      return true;
    } else {
      const error = await response.text();
      console.error('❌ Failed to add transcript:', error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error adding transcript:', error);
    return false;
  }
}

/**
 * Split text into chunks
 */
function chunkText(text, maxSize) {
  if (text.length <= maxSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxSize;
    
    if (end < text.length) {
      const lastSentence = text.lastIndexOf('.', end);
      const lastWord = text.lastIndexOf(' ', end);
      
      if (lastSentence > start + maxSize * 0.5) {
        end = lastSentence + 1;
      } else if (lastWord > start + maxSize * 0.5) {
        end = lastWord;
      }
    }
    
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  
  return chunks;
}

//

/**
 * Send Slack notification for webhook processing
 */
async function sendSlackNotification({ status, webhookType, data, error, slackToken, slackChannel }) {
  if (!slackToken || !slackChannel) {
    console.log('⚠️ Slack notifications disabled - missing SLACK_BOT_TOKEN or SLACK_CHANNEL');
    return;
  }

  try {
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

    const payload = {
      channel: slackChannel,
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ]
    };

    // Add error details if failed
    if (error && error.stack) {
      payload.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Details:*\n\`\`\`\n${error.stack}\n\`\`\``
        }
      });
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ Slack notification sent');
    } else {
      console.error('❌ Failed to send Slack notification:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error sending Slack notification:', error);
  }
}

/**
 * Send debugging notification for webhook reception
 */
async function sendWebhookReceivedNotification({ webhookData, headers, source, slackToken, slackChannel }) {
  if (!slackToken || !slackChannel) {
    console.log('⚠️ Slack notifications disabled - missing SLACK_BOT_TOKEN or SLACK_CHANNEL');
    return;
  }

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

    const payload = {
      channel: slackChannel,
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ]
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ Webhook received notification sent');
    } else {
      console.error('❌ Failed to send webhook received notification:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error sending webhook received notification:', error);
  }
}

/**
 * Send debugging notification for meeting data validation
 */
async function sendMeetingValidationNotification({ webhookData, isValid, missingFields = [], trigger, slackToken, slackChannel }) {
  if (!slackToken || !slackChannel) {
    console.log('⚠️ Slack notifications disabled - missing SLACK_BOT_TOKEN or SLACK_CHANNEL');
    return;
  }

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

    const payload = {
      channel: slackChannel,
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ]
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ Meeting validation notification sent');
    } else {
      console.error('❌ Failed to send meeting validation notification:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error sending meeting validation notification:', error);
  }
}

/**
 * Send debugging notification for Notion database creation
 */
async function sendNotionCreationNotification({ success, notionPageId, webhookData, error, duration, slackToken, slackChannel }) {
  if (!slackToken || !slackChannel) {
    console.log('⚠️ Slack notifications disabled - missing SLACK_BOT_TOKEN or SLACK_CHANNEL');
    return;
  }

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

    const payload = {
      channel: slackChannel,
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ]
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ Notion creation notification sent');
    } else {
      console.error('❌ Failed to send Notion creation notification:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error sending Notion creation notification:', error);
  }
}

//
# Test trigger
