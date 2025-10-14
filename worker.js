/**
 * Cloudflare Worker for Read.ai Webhook Integration
 * 
 * This worker handles webhook requests from Read.ai and creates meeting notes
 * in a Notion database. It's designed to run on Cloudflare Workers.
 */

import NotionClient from './lib/clients/notion-client.js';

/**
 * Handle CORS preflight requests
 */
function handleCORS(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = [
    'https://read.ai',
    'https://app.read.ai',
    'https://180dc.org',
    'https://www.180dc.org'
  ];
  
  const isAllowedOrigin = allowedOrigins.includes(origin);
  
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Handle health check requests
 */
async function handleHealth() {
  return new Response(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: '180dc-read-ai-webhook'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * Test Notion connection
 */
async function handleNotionTest() {
  try {
    const notion = new NotionClient();
    const isConnected = await notion.testConnection();
    
    if (isConnected) {
      return new Response(JSON.stringify({
        status: 'success',
        message: 'Notion connection successful',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Notion connection failed',
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Notion test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * Get database schema
 */
async function handleDatabaseSchema() {
  try {
    const notion = new NotionClient();
    const schema = await notion.getDatabaseSchema();
    
    if (schema) {
      return new Response(JSON.stringify({
        status: 'success',
        schema: {
          title: schema.title[0]?.text?.content || 'Untitled',
          properties: Object.keys(schema.properties || {}),
          propertyTypes: Object.entries(schema.properties || {}).reduce((acc, [key, prop]) => {
            acc[key] = prop.type;
            return acc;
          }, {})
        },
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Failed to get database schema',
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Database schema request failed',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * Process Read.ai webhook payload
 */
async function processReadAIWebhook(payload) {
  try {
    console.log('📥 Processing Read.ai webhook payload...');
    console.log('📊 Payload keys:', Object.keys(payload));
    
    // Extract meeting data from Read.ai payload
    const meetingData = {
      title: payload.meeting_title || payload.title || 'Untitled Meeting',
      start_time: payload.start_time || payload.meeting_start,
      end_time: payload.end_time || payload.meeting_end,
      participants: payload.participants || payload.attendees || [],
      summary: payload.summary || payload.meeting_summary || '',
      action_items: payload.action_items || payload.tasks || [],
      key_questions: payload.key_questions || payload.questions || [],
      topics: payload.topics || payload.meeting_topics || [],
      transcript: payload.transcript || payload.meeting_transcript || '',
      report_url: payload.report_url || payload.meeting_report_url || '',
      session_id: payload.session_id || payload.meeting_id || '',
      type: payload.meeting_type || 'Exec',
      comments: payload.comments || ''
    };
    
    console.log('📝 Extracted meeting data:', {
      title: meetingData.title,
      participants: meetingData.participants.length,
      summary_length: meetingData.summary.length,
      action_items: meetingData.action_items.length,
      transcript_length: meetingData.transcript.length
    });
    
    // Create meeting page in Notion
    const notion = new NotionClient();
    const result = await notion.createMeetingPage(meetingData);
    
    if (result) {
      console.log('✅ Meeting page created successfully:', result.id);
      return {
        success: true,
        page_id: result.id,
        page_url: result.url,
        message: 'Meeting notes created successfully'
      };
    } else {
      console.error('❌ Failed to create meeting page');
      return {
        success: false,
        error: 'Failed to create meeting page in Notion'
      };
    }
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle Read.ai webhook requests
 */
async function handleReadAIWebhook(request) {
  try {
    const payload = await request.json();
    console.log('📥 Received Read.ai webhook');
    
    const result = await processReadAIWebhook(payload);
    
    if (result.success) {
      return new Response(JSON.stringify({
        status: 'success',
        message: result.message,
        page_id: result.page_id,
        page_url: result.page_url,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      return new Response(JSON.stringify({
        status: 'error',
        message: result.error,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Webhook processing failed',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * Test webhook with sample data
 */
async function handleTestWebhook() {
  const samplePayload = {
    meeting_title: 'Test Meeting - 180DC Strategy Session',
    start_time: new Date().toISOString(),
    end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    participants: ['John Doe', 'Jane Smith', 'Bob Johnson'],
    summary: 'This is a test meeting to verify the webhook integration is working correctly.',
    action_items: [
      'Review quarterly goals',
      'Update project timeline',
      'Schedule follow-up meeting'
    ],
    key_questions: [
      'What are our main priorities for Q1?',
      'How can we improve team collaboration?'
    ],
    topics: ['Strategy', 'Planning', 'Team Management'],
    transcript: 'This is a sample transcript for testing purposes. The webhook should process this data and create a meeting page in Notion.',
    report_url: 'https://read.ai/reports/test-report-123',
    session_id: 'test-session-123',
    meeting_type: 'Exec'
  };
  
  console.log('🧪 Testing webhook with sample data...');
  const result = await processReadAIWebhook(samplePayload);
  
  return new Response(JSON.stringify({
    status: result.success ? 'success' : 'error',
    message: result.success ? 'Test webhook processed successfully' : result.error,
    test_data: samplePayload,
    result: result,
    timestamp: new Date().toISOString()
  }), {
    status: result.success ? 200 : 500,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    console.log(`${method} ${path}`);
    
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return handleCORS(request);
    }
    
    // Route requests
    switch (path) {
      case '/health':
        return handleHealth();
        
      case '/test/notion':
        return handleNotionTest();
        
      case '/database/schema':
        return handleDatabaseSchema();
        
      case '/test/webhook':
        return handleTestWebhook();
        
      case '/webhook/read-ai':
      case '/webhook':
        if (method === 'POST') {
          return handleReadAIWebhook(request);
        } else {
          return new Response(JSON.stringify({
            status: 'error',
            message: 'Method not allowed. Use POST for webhook endpoint.',
            timestamp: new Date().toISOString()
          }), {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
      case '/':
        return new Response(JSON.stringify({
          service: '180DC Read.ai Webhook Integration',
          version: '1.0.0',
          endpoints: {
            'GET /health': 'Health check',
            'GET /test/notion': 'Test Notion connection',
            'GET /database/schema': 'Get database schema',
            'GET /test/webhook': 'Test webhook with sample data',
            'POST /webhook/read-ai': 'Read.ai webhook endpoint'
          },
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
        
      default:
        return new Response(JSON.stringify({
          status: 'error',
          message: 'Endpoint not found',
          available_endpoints: [
            'GET /health',
            'GET /test/notion',
            'GET /database/schema',
            'GET /test/webhook',
            'POST /webhook/read-ai'
          ],
          timestamp: new Date().toISOString()
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
    }
  }
};
