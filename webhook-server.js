/**
 * Production Webhook Server for Read.ai Integration
 * This server receives webhooks from Read.ai and creates Notion pages
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ReadAIWebhookHandler from './read-ai-webhook.js';
import SlackNotificationManager from './slack-notifications.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const notifications = new SlackNotificationManager();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support large transcripts
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Read.ai Webhook Handler'
  });
});

// Read.ai webhook endpoint
app.post('/webhook/read-ai', async (req, res) => {
  try {
    console.log('🔔 Received Read.ai webhook');
    console.log('📊 Headers:', req.headers);
    console.log('📊 Body:', JSON.stringify(req.body, null, 2));

    const webhookHandler = new ReadAIWebhookHandler();
    const result = await webhookHandler.processWebhook(req.body, req.headers, "Express Server");

    if (result.success) {
      console.log('✅ Webhook processed successfully');
      
      // Send success notification
      await notifications.notifyWebhookProcessing({
        status: 'success',
        webhookType: 'Read.ai',
        data: req.body
      });
      
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        notionPageId: result.notionPageId,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('❌ Webhook processing failed:', result.error);
      
      // Send failure notification
      await notifications.notifyWebhookProcessing({
        status: 'failure',
        webhookType: 'Read.ai',
        data: req.body,
        error: new Error(result.error)
      });
      
      res.status(400).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Webhook endpoint error:', error);
    
    // Send failure notification
    await notifications.notifyWebhookProcessing({
      status: 'failure',
      webhookType: 'Read.ai',
      data: req.body,
      error: error
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Removed test/dev endpoints for production-only server

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log('🚀 Read.ai Webhook Server started');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔔 Webhook endpoint: http://localhost:${PORT}/webhook/read-ai`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
