#!/usr/bin/env node

/**
 * Google Drive Transcript Sync to Notion
 * 
 * This script monitors a Google Drive folder for transcript files and syncs them to Notion.
 * It checks for new transcript files that haven't been processed yet and creates
 * corresponding entries in the Notion meeting database.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import NotionClient from './notion-client.js';
import SlackNotificationManager from './slack-notifications.js';
import dotenv from 'dotenv';

dotenv.config();

class DriveTranscriptSync {
  constructor() {
    this.drive = google.drive({ version: 'v3' });
    this.notion = new NotionClient();
    this.slack = new SlackNotificationManager();
    this.driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    this.processedFiles = new Set();
    
    // Validate required environment variables
    this.validateEnvironment();
    
    // Initialize Google Auth with proper credentials
    const credentials = {
      type: 'service_account',
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_id: process.env.GOOGLE_CLIENT_ID
    };
    
    console.log('🔍 Credentials Debug:');
    console.log(`   Type: ${credentials.type}`);
    console.log(`   Client Email: ${credentials.client_email ? 'Set' : 'Missing'}`);
    console.log(`   Private Key: ${credentials.private_key ? 'Set (length: ' + credentials.private_key.length + ')' : 'Missing'}`);
    console.log(`   Private Key ID: ${credentials.private_key_id ? 'Set' : 'Missing'}`);
    console.log(`   Project ID: ${credentials.project_id ? 'Set' : 'Missing'}`);
    console.log(`   Client ID: ${credentials.client_id ? 'Set' : 'Missing'}`);
    
    // Try GoogleAuth first
    this.auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    // Test if credentials were loaded
    console.log('🔍 Auth Object After Creation:');
    console.log(`   Auth Type: ${this.auth.constructor.name}`);
    console.log(`   Credentials Loaded: ${!!this.auth.credentials}`);
    console.log(`   Credentials Type: ${this.auth.credentials?.type || 'Not set'}`);
    console.log(`   Client Email: ${this.auth.credentials?.client_email || 'Not set'}`);
    console.log(`   Project ID: ${this.auth.credentials?.project_id || 'Not set'}`);
    
    // If GoogleAuth doesn't work, try JWT directly
    if (!this.auth.credentials) {
      console.log('🔄 GoogleAuth failed, trying JWT directly...');
      this.auth = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
      
      console.log('🔍 JWT Auth Object:');
      console.log(`   Auth Type: ${this.auth.constructor.name}`);
      console.log(`   Email: ${this.auth.email || 'Not set'}`);
      console.log(`   Key: ${this.auth.key ? 'Set' : 'Not set'}`);
    }
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const requiredVars = [
      'GOOGLE_DRIVE_FOLDER_ID',
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_PROJECT_ID',
      'NOTION_TOKEN',
      'MEETING_DATABASE_ID'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    if (!this.driveFolderId) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set or is empty');
    }

    console.log(`📁 Using Google Drive folder ID: ${this.driveFolderId}`);
    
    // Debug environment variables
    console.log('🔍 Environment Variables Debug:');
    console.log(`   GOOGLE_DRIVE_FOLDER_ID: ${this.driveFolderId}`);
    console.log(`   GOOGLE_CLIENT_EMAIL: ${process.env.GOOGLE_CLIENT_EMAIL}`);
    console.log(`   GOOGLE_PROJECT_ID: ${process.env.GOOGLE_PROJECT_ID}`);
    console.log(`   GOOGLE_PRIVATE_KEY: ${process.env.GOOGLE_PRIVATE_KEY ? 'Set (length: ' + process.env.GOOGLE_PRIVATE_KEY.length + ')' : 'Not set'}`);
    console.log(`   GOOGLE_PRIVATE_KEY_ID: ${process.env.GOOGLE_PRIVATE_KEY_ID}`);
    console.log(`   GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID}`);
  }

  /**
   * Main sync function
   */
  async sync() {
    const startTime = Date.now();
    console.log('🔄 Starting Google Drive transcript sync...');
    
    try {
      // Test connections
      await this.testConnections();
      
      // Get processed files from Notion
      await this.loadProcessedFiles();
      
      // Get files from Google Drive folder
      const driveFiles = await this.getDriveFiles();
      console.log(`📁 Found ${driveFiles.length} files in Google Drive folder`);
      
      // Filter for transcript files
      const transcriptFiles = this.filterTranscriptFiles(driveFiles);
      console.log(`📄 Found ${transcriptFiles.length} transcript files`);
      
      // Filter for new files
      const newFiles = transcriptFiles.filter(file => !this.processedFiles.has(file.id));
      console.log(`🆕 Found ${newFiles.length} new transcript files to process`);
      
      if (newFiles.length === 0) {
        console.log('✅ No new transcript files to process');
        await this.slack.notifyAutomationSuccess({
          script: 'Drive Transcript Sync',
          summary: 'No new transcript files found in Google Drive folder',
          results: { processed: 0, skipped: transcriptFiles.length },
          duration: Date.now() - startTime
        });
        return;
      }
      
      // Process new files
      const results = await this.processTranscriptFiles(newFiles);
      
      // Send success notification
      await this.slack.notifyAutomationSuccess({
        script: 'Drive Transcript Sync',
        summary: `Processed ${results.processed} new transcript files from Google Drive`,
        results: results,
        duration: Date.now() - startTime
      });
      
      console.log('✅ Drive transcript sync completed successfully!');
      
    } catch (error) {
      console.error('❌ Drive transcript sync failed:', error);
      
      // Send failure notification
      await this.slack.notifyAutomationFailure({
        script: 'Drive Transcript Sync',
        error: error,
        context: 'Failed to sync transcript files from Google Drive to Notion'
      });
      
      throw error;
    }
  }

  /**
   * Test all connections
   */
  async testConnections() {
    console.log('🔍 Testing connections...');
    
    // Test Google Drive connection with detailed debugging
    try {
      const token = await this.auth.getAccessToken();
      console.log('✅ Google Drive connection successful');
      console.log(`🔑 Service Account Email: ${process.env.GOOGLE_CLIENT_EMAIL}`);
      console.log(`🔑 Project ID: ${process.env.GOOGLE_PROJECT_ID}`);
      console.log(`🔑 Token Type: ${token.token_type}`);
      console.log(`🔑 Access Token: ${token.access_token ? 'Present (length: ' + token.access_token.length + ')' : 'Missing'}`);
      console.log(`🔑 Token Expiry: ${token.expiry_date ? new Date(token.expiry_date).toISOString() : 'Unknown'}`);
      
      // Debug the actual credentials being used
      console.log('🔍 Authentication Debug:');
      console.log(`   Client Email: ${process.env.GOOGLE_CLIENT_EMAIL}`);
      console.log(`   Private Key ID: ${process.env.GOOGLE_PRIVATE_KEY_ID}`);
      console.log(`   Client ID: ${process.env.GOOGLE_CLIENT_ID}`);
      console.log(`   Private Key Format: ${process.env.GOOGLE_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY') ? 'Correct format' : 'Incorrect format'}`);
      
      // Test the actual auth object
      console.log('🔍 Auth Object Debug:');
      console.log(`   Auth Type: ${this.auth.constructor.name}`);
      console.log(`   Credentials Type: ${this.auth.credentials?.type || 'Unknown'}`);
      console.log(`   Credentials Client Email: ${this.auth.credentials?.client_email || 'Unknown'}`);
      console.log(`   Credentials Project ID: ${this.auth.credentials?.project_id || 'Unknown'}`);
      console.log(`   Scopes: ${this.auth.scopes?.join(', ') || 'Unknown'}`);
      
      // Test authentication first
      await this.testAuthentication();
      
      // Test if we can access Drive API at all
      await this.testDriveAPIAccess();
      
      // Test specific folder access
      await this.testFolderAccess();
      
      // Test required scopes
      await this.testRequiredScopes();
      
    } catch (error) {
      console.error('❌ Google Drive connection failed:', error);
      throw new Error(`Google Drive connection failed: ${error.message}`);
    }
    
    // Test Notion connection
    const notionConnected = await this.notion.testConnection();
    if (!notionConnected) {
      throw new Error('Notion connection failed');
    }
    
    // Test Slack connection
    const slackConnected = await this.slack.testConnection();
    if (!slackConnected) {
      console.warn('⚠️ Slack connection failed - notifications may not work');
    }
  }

  /**
   * Test authentication with detailed debugging
   */
  async testAuthentication() {
    try {
      console.log('🔍 Testing authentication...');
      
      // Force authentication
      await this.auth.getAccessToken();
      
      // Check if credentials are loaded
      console.log('🔍 Authentication Debug:');
      console.log(`   Auth Type: ${this.auth.constructor.name}`);
      console.log(`   Credentials Loaded: ${!!this.auth.credentials}`);
      console.log(`   Credentials Type: ${this.auth.credentials?.type || 'Not set'}`);
      console.log(`   Client Email: ${this.auth.credentials?.client_email || 'Not set'}`);
      console.log(`   Project ID: ${this.auth.credentials?.project_id || 'Not set'}`);
      console.log(`   Private Key ID: ${this.auth.credentials?.private_key_id || 'Not set'}`);
      console.log(`   Client ID: ${this.auth.credentials?.client_id || 'Not set'}`);
      
      // Test if we can get a fresh token
      const freshToken = await this.auth.getAccessToken();
      console.log(`   Fresh Token: ${freshToken.access_token ? 'Present' : 'Missing'}`);
      console.log(`   Token Type: ${freshToken.token_type || 'Unknown'}`);
      
      console.log('✅ Authentication successful');
      
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      console.error(`🚨 This indicates a problem with the service account credentials`);
      console.error(`   Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test Drive API access
   */
  async testDriveAPIAccess() {
    try {
      console.log('🔍 Testing Drive API access...');
      
      // Test if we can access the Drive API at all
      const aboutResponse = await this.drive.about.get({
        auth: this.auth,
        fields: 'user,storageQuota'
      });
      
      console.log('✅ Drive API access successful');
      console.log(`👤 User: ${aboutResponse.data.user?.emailAddress || 'N/A'}`);
      console.log(`💾 Storage: ${aboutResponse.data.storageQuota?.total || 'N/A'} bytes`);
      
      // Test if we can list files (basic permission test)
      const testResponse = await this.drive.files.list({
        auth: this.auth,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        pageSize: 1,
        fields: 'files(id,name)'
      });
      
      console.log('✅ File listing permission confirmed');
      console.log(`📊 Can list files: ${testResponse.data.files ? 'Yes' : 'No'}`);
      
      // Test if we can search for files
      const searchResponse = await this.drive.files.list({
        auth: this.auth,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        q: "name contains 'test'",
        pageSize: 1,
        fields: 'files(id,name)'
      });
      
      console.log('✅ File search permission confirmed');
      console.log(`🔍 Can search files: ${searchResponse.data.files ? 'Yes' : 'No'}`);
      
    } catch (error) {
      console.error('❌ Drive API access failed:', error);
      console.error(`🚨 This indicates a problem with Drive API permissions`);
      console.error(`   Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test folder access with detailed debugging
   */
  async testFolderAccess() {
    try {
      console.log(`🔍 Testing access to folder: ${this.driveFolderId}`);
      console.log(`🔍 Folder ID type: ${typeof this.driveFolderId}`);
      console.log(`🔍 Folder ID length: ${this.driveFolderId?.length || 'undefined'}`);
      console.log(`🔍 Folder ID starts with: ${this.driveFolderId?.substring(0, 10) || 'undefined'}`);
      
      // Directly access the folder by ID (no need to search)
      console.log('🔍 Accessing folder directly by ID...');
      
      // First, try to get folder metadata
      const folderResponse = await this.drive.files.get({
        auth: this.auth,
        fileId: this.driveFolderId,
        supportsAllDrives: true,
        fields: 'id,name,mimeType,permissions,owners,shared'
      });
      
      console.log('✅ Folder access successful!');
      console.log(`📁 Folder Name: ${folderResponse.data.name}`);
      console.log(`📁 Folder ID: ${folderResponse.data.id}`);
      console.log(`📁 MIME Type: ${folderResponse.data.mimeType}`);
      console.log(`📁 Shared: ${folderResponse.data.shared}`);
      
      if (folderResponse.data.permissions) {
        console.log(`📁 Permissions: ${folderResponse.data.permissions.length} permission entries`);
        folderResponse.data.permissions.forEach((perm, index) => {
          console.log(`  ${index + 1}. Role: ${perm.role}, Type: ${perm.type}, Email: ${perm.emailAddress || 'N/A'}`);
        });
      }
      
      if (folderResponse.data.owners) {
        console.log(`📁 Owners: ${folderResponse.data.owners.map(owner => owner.emailAddress).join(', ')}`);
      }
      
    } catch (error) {
      console.error('❌ Folder access failed:', error);
      
      if (error.code === 404) {
        console.error('🚨 Folder not found - check if folder ID is correct');
        console.error(`   Current folder ID: ${this.driveFolderId}`);
        console.error('   Expected format: 1Cm1eXn2oMwvXYnPr4fh92AdUF7zwULlP');
      } else if (error.code === 403) {
        console.error('🚨 Access denied - service account needs permission');
        console.error(`   Service account: ${process.env.GOOGLE_CLIENT_EMAIL}`);
        console.error('   Action: Share the folder with this email address');
      } else {
        console.error(`🚨 Error code: ${error.code}, Message: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Test required scopes for Google Drive access
   */
  async testRequiredScopes() {
    try {
      console.log('🔍 Testing required scopes...');
      
      // Test if we can access the Drive API
      const aboutResponse = await this.drive.about.get({
        auth: this.auth,
        fields: 'user,storageQuota'
      });
      
      console.log('✅ Drive API access successful');
      console.log(`👤 User: ${aboutResponse.data.user?.emailAddress || 'N/A'}`);
      console.log(`💾 Storage: ${aboutResponse.data.storageQuota?.total || 'N/A'} bytes`);
      
      // Test if we can list files (basic permission test)
      const testResponse = await this.drive.files.list({
        auth: this.auth,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        pageSize: 1,
        fields: 'files(id,name)'
      });
      
      console.log('✅ File listing permission confirmed');
      console.log(`📊 Can list files: ${testResponse.data.files ? 'Yes' : 'No'}`);
      
    } catch (error) {
      console.error('❌ Scope testing failed:', error);
      console.error(`🚨 This indicates missing permissions or incorrect scopes`);
      console.error(`   Required scope: https://www.googleapis.com/auth/drive.readonly`);
      console.error(`   Error: ${error.message}`);
      
      throw error;
    }
  }

  /**
   * Load processed files from Notion database
   */
  async loadProcessedFiles() {
    try {
      console.log('📋 Loading processed files from Notion...');
      
      const pages = await this.notion.getMeetingPages();
      console.log(`📊 Found ${pages.length} existing meeting pages in Notion`);
      
      // Extract file IDs from existing pages
      pages.forEach(page => {
        const properties = page.properties;
        if (properties && properties['Session ID'] && properties['Session ID'].rich_text) {
          const sessionId = properties['Session ID'].rich_text[0]?.text?.content;
          if (sessionId) {
            this.processedFiles.add(sessionId);
          }
        }
      });
      
      console.log(`📝 Loaded ${this.processedFiles.size} processed file IDs`);
      
    } catch (error) {
      console.error('❌ Error loading processed files:', error);
      throw error;
    }
  }

  /**
   * Get files from Google Drive folder
   */
  async getDriveFiles() {
    try {
      console.log(`📁 Getting files from Google Drive folder: ${this.driveFolderId}`);
      console.log(`🔍 Query: '${this.driveFolderId}' in parents and trashed=false`);
      
      const response = await this.drive.files.list({
        auth: this.auth,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        q: `'${this.driveFolderId}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink)',
        orderBy: 'modifiedTime desc'
      });
      
      const files = response.data.files || [];
      console.log(`📊 API Response: Found ${files.length} files`);
      
      if (files.length > 0) {
        console.log('📄 Files found:');
        files.forEach((file, index) => {
          console.log(`  ${index + 1}. ${file.name} (${file.mimeType}) - ${file.id}`);
        });
      } else {
        console.log('📄 No files found in folder');
        console.log('🔍 This could mean:');
        console.log('   - Folder is empty');
        console.log('   - Service account has no access to files');
        console.log('   - Files are in subfolders (not supported)');
      }
      
      return files;
      
    } catch (error) {
      console.error('❌ Error getting Drive files:', error);
      console.error(`🚨 Error details:`, {
        code: error.code,
        message: error.message,
        status: error.status,
        statusText: error.statusText
      });
      
      if (error.code === 404) {
        console.error('🚨 Folder not found - check folder ID');
      } else if (error.code === 403) {
        console.error('🚨 Access denied - check service account permissions');
        console.error(`   Service account: ${process.env.GOOGLE_CLIENT_EMAIL}`);
        console.error('   Required scopes: https://www.googleapis.com/auth/drive.readonly');
      }
      
      throw error;
    }
  }

  /**
   * Filter for transcript files
   */
  filterTranscriptFiles(files) {
    const transcriptExtensions = ['.txt', '.doc', '.docx', '.pdf'];
    
    return files.filter(file => {
      const name = file.name.toLowerCase();
      
      // Check for transcript file extensions
      const hasExtension = transcriptExtensions.some(ext => 
        name.endsWith(ext)
      );
      
      return hasExtension;
    });
  }

  /**
   * Process transcript files
   */
  async processTranscriptFiles(files) {
    const results = {
      processed: 0,
      failed: 0,
      errors: []
    };
    
    for (const file of files) {
      try {
        console.log(`📄 Processing file: ${file.name}`);
        
        // Download file content
        const content = await this.downloadFileContent(file.id);
        
        // Extract transcript data
        const transcriptData = this.extractTranscriptData(file, content);
        
        // Create Notion page
        const notionPage = await this.notion.createMeetingPage(transcriptData);
        
        if (notionPage) {
          console.log(`✅ Created Notion page for: ${file.name}`);
          results.processed++;
        } else {
          console.error(`❌ Failed to create Notion page for: ${file.name}`);
          results.failed++;
          results.errors.push(`Failed to create Notion page for ${file.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing file ${file.name}:`, error);
        results.failed++;
        results.errors.push(`Error processing ${file.name}: ${error.message}`);
      }
    }
    
    return results;
  }

  /**
   * Download file content from Google Drive
   */
  async downloadFileContent(fileId) {
    try {
      const response = await this.drive.files.get({
        auth: this.auth,
        fileId: fileId,
        alt: 'media'
      });
      
      return response.data;
      
    } catch (error) {
      console.error('❌ Error downloading file content:', error);
      throw error;
    }
  }

  /**
   * Extract transcript data from file
   */
  extractTranscriptData(file, content) {
    // Parse file name for meeting information
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    // Extract date from filename if present
    const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})|(\d{2}-\d{2}-\d{4})|(\d{2}\/\d{2}\/\d{4})/);
    const extractedDate = dateMatch ? dateMatch[0] : null;
    
    // Create basic meeting data structure
    const title = this.extractTitleFromFileName(fileName);
    const meetingData = {
      session_id: file.id,
      title: title,
      start_time: extractedDate ? this.parseDate(extractedDate) : file.createdTime,
      end_time: file.modifiedTime,
      participants: this.extractParticipantsFromContent(content),
      owner: 'Drive Sync',
      summary: this.extractSummaryFromContent(content),
      action_items: this.extractActionItemsFromContent(content),
      key_questions: this.extractKeyQuestionsFromContent(content),
      topics: this.extractTopicsFromContent(content),
      report_url: file.webViewLink,
      transcript: content,
      type: this.extractTypeFromTitle(title),
      comments: 'Manually uploaded'
    };
    
    return meetingData;
  }

  /**
   * Extract title from filename
   */
  extractTitleFromFileName(fileName) {
    // Remove file extension
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    
    // Clean up common patterns
    let title = nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\d{4}-\d{2}-\d{2}/g, '')
      .replace(/\d{2}-\d{2}-\d{4}/g, '')
      .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
      .trim();
    
    // Capitalize first letter of each word
    title = title.replace(/\b\w/g, l => l.toUpperCase());
    
    return title || 'Meeting Transcript';
  }

  /**
   * Parse date string
   */
  parseDate(dateString) {
    try {
      // Handle different date formats
      let date;
      if (dateString.includes('-')) {
        date = new Date(dateString);
      } else if (dateString.includes('/')) {
        const [day, month, year] = dateString.split('/');
        date = new Date(year, month - 1, day);
      }
      
      return date ? date.toISOString() : null;
    } catch (error) {
      console.warn('⚠️ Could not parse date:', dateString);
      return null;
    }
  }

  /**
   * Extract participants from content
   */
  extractParticipantsFromContent(content) {
    if (!content || typeof content !== 'string') return [];
    
    // Look for common participant patterns
    const participantPatterns = [
      /participants?:\s*([^\n]+)/i,
      /attendees?:\s*([^\n]+)/i,
      /people:\s*([^\n]+)/i,
      /members?:\s*([^\n]+)/i
    ];
    
    for (const pattern of participantPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].split(',').map(p => p.trim()).filter(p => p).slice(0, 10); // Limit to 10 participants
      }
    }
    
    return [];
  }

  /**
   * Extract summary from content
   */
  extractSummaryFromContent(content) {
    if (!content || typeof content !== 'string') return '';
    
    // Look for summary section
    const summaryPatterns = [
      /summary:\s*([^\n]+(?:\n(?!\n)[^\n]+)*)/i,
      /overview:\s*([^\n]+(?:\n(?!\n)[^\n]+)*)/i,
      /abstract:\s*([^\n]+(?:\n(?!\n)[^\n]+)*)/i
    ];
    
    for (const pattern of summaryPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    // If no summary found, use first paragraph
    const firstParagraph = content.split('\n\n')[0];
    return firstParagraph ? firstParagraph.substring(0, 500) : '';
  }

  /**
   * Extract action items from content
   */
  extractActionItemsFromContent(content) {
    if (!content || typeof content !== 'string') return [];
    
    const actionItems = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for action item patterns
      if (
        trimmedLine.match(/^[-*•]\s*action:/i) ||
        trimmedLine.match(/^[-*•]\s*todo:/i) ||
        trimmedLine.match(/^[-*•]\s*task:/i) ||
        trimmedLine.match(/^[-*•]\s*next steps?:/i) ||
        trimmedLine.match(/^action items?:/i)
      ) {
        actionItems.push(trimmedLine.replace(/^[-*•]\s*(action|todo|task|next steps?):\s*/i, ''));
      }
    }
    
    // Limit to 5 action items and truncate each to 200 chars
    return actionItems.slice(0, 5).map(item => item.length > 200 ? item.substring(0, 197) + '...' : item);
  }

  /**
   * Extract key questions from content
   */
  extractKeyQuestionsFromContent(content) {
    if (!content || typeof content !== 'string') return [];
    
    const questions = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for question patterns
      if (
        trimmedLine.includes('?') ||
        trimmedLine.match(/^[-*•]\s*question:/i) ||
        trimmedLine.match(/^[-*•]\s*key questions?:/i)
      ) {
        questions.push(trimmedLine);
      }
    }
    
    // Limit to 5 questions and truncate each to 200 chars to stay under Notion limits
    return questions.slice(0, 5).map(q => q.length > 200 ? q.substring(0, 197) + '...' : q);
  }

  /**
   * Extract topics from content
   */
  extractTopicsFromContent(content) {
    if (!content || typeof content !== 'string') return [];
    
    // Look for topics section
    const topicsPattern = /topics?:\s*([^\n]+)/i;
    const match = content.match(topicsPattern);
    
    if (match) {
      return match[1].split(',').map(t => t.trim()).filter(t => t);
    }
    
    return [];
  }

  /**
   * Extract type from title (detect Project meetings, default to Exec)
   */
  extractTypeFromTitle(title) {
    if (!title || typeof title !== 'string') return 'Exec';
    
    // Check if title contains "(Project)" or "(Projects)" (case insensitive)
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('(project)') || lowerTitle.includes('(projects)')) {
      return 'Project';
    }
    
    // Default to Exec for all other meetings
    return 'Exec';
  }
}

// Main execution
async function main() {
  const sync = new DriveTranscriptSync();
  
  try {
    await sync.sync();
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default DriveTranscriptSync;
