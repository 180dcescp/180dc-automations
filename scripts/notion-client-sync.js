#!/usr/bin/env node

/**
 * Notion Client Database Sync
 * 
 * Migrated from Google Apps Script to GitHub Actions
 * Syncs Google Sheets client data with Notion database
 * 
 * Features:
 * - Header-based mapping (dynamic column detection)
 * - Incremental sync (updates existing, creates new, archives missing)
 * - Rate limiting and error handling
 * - Extensive logging for debugging
 */

import { google } from 'googleapis';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

class NotionClientSync {
  constructor() {
    // Validate required environment variables
    this.validateEnvironment();
    
    this.sheets = null;
    this.drive = null;
    this.sheetsId = this.extractSheetId(process.env.GSHEET_CLIENTS_LINK);
    this.notionToken = process.env.NOTION_TOKEN;
    this.notionDatabaseId = process.env.NOTION_CLIENT_DATABASE;
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.dryRun = process.env.DRY_RUN === 'true';
    
    // Initialize Google Drive API
    this.initializeGoogleDrive();
    
    this.notionApiBase = 'https://api.notion.com/v1';
    this.notionApiVersion = '2022-06-28';
    
    // Configuration
    this.config = {
      SHEET_NAME: 'Client Database',
      RATE_LIMIT_MS: 350
    };
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const required = [
      'GSHEET_CLIENTS_LINK',
      'GOOGLE_PROJECT_ID',
      'GOOGLE_PRIVATE_KEY_ID',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_CLIENT_ID',
      'NOTION_TOKEN',
      'NOTION_CLIENT_DATABASE',
      'SLACK_BOT_TOKEN'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Extract sheet ID from Google Sheets URL
   */
  extractSheetId(url) {
    if (!url) {
      throw new Error('GSHEET_CLIENTS_LINK environment variable is required');
    }
    
    // Extract sheet ID from various Google Sheets URL formats
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,  // Standard format
      /\/d\/([a-zA-Z0-9-_]+)/,                // Short format
      /id=([a-zA-Z0-9-_]+)/                   // Alternative format
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    throw new Error(`Could not extract sheet ID from URL: ${url}`);
  }

  /**
   * Initialize Google Drive API
   */
  initializeGoogleDrive() {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          type: 'service_account',
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL}`
        },
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/spreadsheets.readonly'
        ]
      });

      this.drive = google.drive({ version: 'v3', auth });
      console.log('✅ Google Drive API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Drive API:', error);
      throw error;
    }
  }

  /**
   * Initialize Google Sheets API
   */
  async initializeSheets() {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          type: 'service_account',
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL}`
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('✅ Google Sheets API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets API:', error);
      throw error;
    }
  }

  /**
   * Read client data from Google Sheets
   */
  async readClients() {
    try {
      console.log(`📊 Reading client data from sheet: ${this.config.SHEET_NAME}`);
      
      // First, get the spreadsheet metadata to find the correct sheet name
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetsId
      });
      
      const sheets = spreadsheet.data.sheets || [];
      console.log(`📋 Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
      
      // Find the sheet that matches our target name (case-insensitive)
      const targetSheet = sheets.find(sheet => 
        sheet.properties?.title?.toLowerCase() === this.config.SHEET_NAME.toLowerCase()
      );
      
      if (!targetSheet) {
        throw new Error(`Sheet "${this.config.SHEET_NAME}" not found. Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
      }
      
      const actualSheetName = targetSheet.properties.title;
      console.log(`📊 Using sheet: "${actualSheetName}"`);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetsId,
        range: `${actualSheetName}!A:Z`
      });

      const values = response.data.values;
      if (!values || values.length < 2) {
        throw new Error('No data found in sheet');
      }

      const headers = values[0];
      const dataRows = values.slice(1);
      
      // Create header mapping
      const headerMap = {};
      headers.forEach((header, index) => {
        if (header && String(header).trim()) {
          headerMap[String(header).trim()] = index;
        }
      });

      console.log(`📋 Sheet headers (${Object.keys(headerMap).length}): ${Object.keys(headerMap).join(' | ')}`);

      // Transform rows to client objects
      const clients = dataRows.map((row, index) => {
        const client = {};
        Object.keys(headerMap).forEach(header => {
          const columnIndex = headerMap[header];
          client[header] = row[columnIndex] || '';
        });
        client._rowIndex = index + 2; // +2 because we skipped header and arrays are 0-indexed
        return client;
      });

      console.log(`📊 Loaded ${clients.length} clients from sheet`);
      return { clients, headerMap };
    } catch (error) {
      console.error('❌ Error reading clients from sheet:', error);
      throw error;
    }
  }

  /**
   * Get Notion database schema
   */
  async getDatabaseSchema() {
    try {
      console.log('🔍 Getting Notion database schema...');
      
      const response = await fetch(`${this.notionApiBase}/databases/${this.notionDatabaseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': this.notionApiVersion
        }
      });

      if (response.ok) {
        const database = await response.json();
        console.log('✅ Database found!');
        console.log('📋 Database Title:', database.title[0]?.text?.content || 'Untitled');
        console.log('\n📊 Database Properties:');
        
        Object.entries(database.properties).forEach(([key, property]) => {
          console.log(`  • ${key}: ${property.type}`);
          if (property.type === 'select' && property.select?.options) {
            console.log(`    Options: ${property.select.options.map(opt => opt.name).join(', ')}`);
          }
          if (property.type === 'multi_select' && property.multi_select?.options) {
            console.log(`    Options: ${property.multi_select.options.map(opt => opt.name).join(', ')}`);
          }
        });
        
        return database;
      } else {
        const error = await response.text();
        console.error('❌ Failed to get database schema:', error);
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting database schema:', error);
      return null;
    }
  }

  /**
   * Query all existing pages from Notion database
   */
  async queryAllPages() {
    try {
      console.log('🔍 Querying existing pages from Notion...');
      const results = [];
      let cursor;
      let page = 1;
      
      do {
        const payload = cursor ? { start_cursor: cursor } : {};
        console.log(`📄 Querying Notion pages — page ${page}...`);
        
        const response = await fetch(`${this.notionApiBase}/databases/${this.notionDatabaseId}/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.notionToken}`,
            'Notion-Version': this.notionApiVersion,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Notion query failed [${response.status}]: ${error}`);
        }

        const data = await response.json();
        results.push(...data.results);
        cursor = data.has_more ? data.next_cursor : null;
        page++;
      } while (cursor);
      
      console.log(`📊 Fetched ${results.length} existing pages from Notion.`);
      return results;
    } catch (error) {
      console.error('❌ Error querying existing pages:', error);
      return [];
    }
  }

  /**
   * Get title from Notion page
   */
  getTitleFromPage(page, titleProp) {
    const p = page.properties?.[titleProp];
    if (!p || !p.title || !p.title.length) return '';
    return p.title[0].plain_text || p.title[0].text?.content || '';
  }

  /**
   * Convert value to Notion property based on type
   */
  valueToNotionProp(value, notionType) {
    const v = (value === null || value === undefined) ? '' : String(value).trim();
    if (!v) return null;

    switch (notionType) {
      case 'title':
        return { title: [{ text: { content: v } }] };

      case 'rich_text':
        return { rich_text: [{ text: { content: v } }] };

      case 'url':
        return { url: v };

      case 'email':
        return { email: v };

      case 'number': {
        const num = Number(String(v).replace(/[^\d.-]/g, ''));
        return isNaN(num) ? null : { number: num };
      }

      case 'select':
        return { select: { name: v } };

      case 'multi_select': {
        const opts = v.split(',').map(s => ({ name: s.trim() })).filter(o => o.name);
        return opts.length ? { multi_select: opts } : null;
      }

      case 'files': {
        const str = String(v).trim();
        if (!str) return null;
        const parts = str.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        if (!parts.length) return null;
        return { files: parts.map(url => this.toNotionFile(url)).filter(Boolean) };
      }

      case 'phone_number':
        return { phone_number: v };

      case 'date': {
        const d = new Date(v);
        if (isNaN(d.getTime())) return null;
        return { date: { start: d.toISOString() } };
      }

      // Skip auto-mapped types to avoid clobbering
      case 'people':
      case 'relation':
      case 'formula':
      case 'rollup':
      case 'status':
      case 'checkbox':
        return null;

      default:
        // Safety fallback — store as rich text
        return { rich_text: [{ text: { content: v } }] };
    }
  }

  /**
   * Build properties from row data
   */
  async buildPropsFromRow(row, headerMap, schema, titleProp) {
    const props = {};
    let coverUrl = null;
    
    console.log(`🔍 Available columns:`, Object.keys(schema));
    console.log(`🔍 Looking for logo column in:`, Object.keys(schema).filter(col => col.toLowerCase().includes('logo')));
    console.log(`🔍 Header map keys:`, Object.keys(headerMap));
    console.log(`🔍 Looking for 'Client logo' in header map:`, Object.keys(headerMap).filter(col => col.toLowerCase().includes('logo')));
    
    // First, check for logo column in the Google Sheet headers (not just Notion schema)
    for (const headerName in headerMap) {
      const idx = headerMap[headerName];
      const cell = row[idx];
      
      // Check if this is a logo column from the Google Sheet
      const isLogoColumn = headerName.toLowerCase().includes('logo') || headerName.toLowerCase().includes('image') || headerName === 'Client logo';
      if (isLogoColumn && cell && cell.trim() !== '') {
        console.log(`🔍 Processing logo/image column "${headerName}" with value: "${cell}"`);
        const convertedUrl = this.convertGoogleDriveUrl(cell);
        console.log(`🔗 Converted URL: ${convertedUrl}`);
        if (convertedUrl) {
          coverUrl = convertedUrl;
          console.log(`✅ Set cover URL: ${coverUrl}`);
        } else {
          console.log(`⚠️ No valid cover URL found for "${headerName}"`);
        }
        // Don't process this column again in the main loop
        continue;
      }
    }
    
    for (const propName in schema) {
      const idx = headerMap[propName];
      if (idx === undefined) continue; // header not present in sheet
      const notionType = schema[propName].type;
      
      // Debug: show column processing
      if (propName.toLowerCase().includes('logo') || propName.toLowerCase().includes('image')) {
        console.log(`🔍 Found potential logo column: "${propName}" (type: ${notionType})`);
      }

      // Title must always be set even if empty
      if (propName === titleProp) {
        const raw = row[idx];
        const titleText = (raw && String(raw).trim()) ? String(raw).trim() : 'Untitled';
        props[propName] = { title: [{ text: { content: titleText } }] };
        continue;
      }

      const cell = row[idx];
      
      // Skip logo columns as they're handled above
      const isLogoColumn = propName.toLowerCase().includes('logo') || propName.toLowerCase().includes('image') || propName === 'Client logo';
      if (isLogoColumn) {
        continue;
      }
      
      // Handle other file properties (Scoping Document, Final Presentation, etc.)
      if (notionType === 'files' && !propName.toLowerCase().includes('logo') && !propName.toLowerCase().includes('image') && propName !== 'Client logo') {
        console.log(`📄 Processing file column "${propName}" with value: "${cell}"`);
        const fileUrl = this.convertGoogleDriveUrl(cell);
        console.log(`🔗 Converted file URL: ${fileUrl}`);
        if (fileUrl) {
          const fileObj = await this.toNotionFile(fileUrl);
          console.log(`📎 File object:`, JSON.stringify(fileObj, null, 2));
          if (fileObj) {
            props[propName] = { files: [fileObj] };
            console.log(`✅ Added file to property "${propName}"`);
          } else {
            console.log(`⚠️ Failed to create file object for "${propName}"`);
          }
        } else {
          console.log(`⚠️ No valid file URL found for "${propName}"`);
        }
        continue;
      }
      
      const pv = this.valueToNotionProp(cell, notionType);
      if (pv) props[propName] = pv;
    }
    
    return { props, coverUrl };
  }

  /**
   * Create page in Notion
   */
  async createPage(properties, logKey, coverUrl = null) {
    try {
      const pageData = {
        parent: { database_id: this.notionDatabaseId },
        properties
      };

    // Add cover if provided
    if (coverUrl) {
      try {
        console.log(`🖼️ Downloading cover image: ${coverUrl}`);
        const coverFile = await this.toNotionFile(coverUrl);
        if (coverFile && coverFile.type === 'file') {
          // Use uploaded file as cover
          pageData.cover = {
            type: 'file',
            file: coverFile.file
          };
          console.log(`🖼️ Using uploaded cover file`);
        } else {
          // Fallback to external URL
          pageData.cover = {
            type: 'external',
            external: { url: coverUrl }
          };
          console.log(`🖼️ Using external cover URL: ${coverUrl}`);
        }
        console.log(`🖼️ Cover object:`, JSON.stringify(pageData.cover, null, 2));
      } catch (error) {
        console.log(`⚠️ Failed to download cover image: ${error.message}`);
        // Fallback to external URL
        pageData.cover = {
          type: 'external',
          external: { url: coverUrl }
        };
        console.log(`🖼️ Using external cover URL as fallback: ${coverUrl}`);
      }
    } else {
      console.log(`⚠️ No cover URL provided for page creation`);
    }

      const response = await fetch(`${this.notionApiBase}/pages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': this.notionApiVersion,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pageData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Notion create failed [${response.status}]: ${error}`);
      }

      const result = await response.json();
      console.log(`✅ Created page: ${logKey} | id=${result.id}`);
      return result;
    } catch (error) {
      console.error(`❌ Error creating page ${logKey}:`, error);
      throw error;
    }
  }

  /**
   * Update page in Notion
   */
  async updatePage(pageId, properties, logKey, coverUrl = null) {
    try {
      const updateData = { properties };

    // Add cover if provided
    if (coverUrl) {
      try {
        console.log(`🖼️ Downloading cover image: ${coverUrl}`);
        const coverFile = await this.toNotionFile(coverUrl);
        if (coverFile && coverFile.type === 'file') {
          // Use uploaded file as cover
          updateData.cover = {
            type: 'file',
            file: coverFile.file
          };
          console.log(`🖼️ Using uploaded cover file`);
        } else {
          // Fallback to external URL
          updateData.cover = {
            type: 'external',
            external: { url: coverUrl }
          };
          console.log(`🖼️ Using external cover URL: ${coverUrl}`);
        }
        console.log(`🖼️ Cover update object:`, JSON.stringify(updateData.cover, null, 2));
      } catch (error) {
        console.log(`⚠️ Failed to download cover image: ${error.message}`);
        // Fallback to external URL
        updateData.cover = {
          type: 'external',
          external: { url: coverUrl }
        };
        console.log(`🖼️ Using external cover URL as fallback: ${coverUrl}`);
      }
    } else {
      console.log(`⚠️ No cover URL provided for page update`);
    }

      const response = await fetch(`${this.notionApiBase}/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': this.notionApiVersion,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Notion update failed [${response.status}]: ${error}`);
      }

      const result = await response.json();
      console.log(`✅ Updated page: ${logKey} | id=${result.id}`);
      return result;
    } catch (error) {
      console.error(`❌ Error updating page ${logKey}:`, error);
      throw error;
    }
  }

  /**
   * Archive page in Notion
   */
  async archivePage(pageId, logKey) {
    try {
      const response = await fetch(`${this.notionApiBase}/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': this.notionApiVersion,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ archived: true })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Notion archive failed [${response.status}]: ${error}`);
      }

      console.log(`✅ Archived page: ${logKey} | id=${pageId}`);
    } catch (error) {
      console.error(`❌ Error archiving page ${logKey}:`, error);
      throw error;
    }
  }

  /**
   * Convert Google URL to accessible URL
   */
  convertGoogleDriveUrl(logoUrl) {
    try {
      // Skip empty, null, undefined, or dash-only values
      if (!logoUrl || logoUrl.trim() === '' || logoUrl.trim() === '-') {
        return null;
      }
      
      const trimmedUrl = logoUrl.trim();
      
      // Handle Google Drive file URLs
      if (trimmedUrl.includes('drive.google.com/file/d/')) {
        // Format: https://drive.google.com/file/d/FILE_ID/view
        const fileIdMatch = trimmedUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
      } else if (trimmedUrl.includes('drive.google.com/open')) {
        // Format: https://drive.google.com/open?id=FILE_ID
        const fileIdMatch = trimmedUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
      } else if (trimmedUrl.includes('drive.google.com/uc')) {
        // Already in the correct format
        return trimmedUrl;
      }
      // Handle Google Docs URLs - Use direct file access instead of export
      else if (trimmedUrl.includes('docs.google.com/document/')) {
        // Format: https://docs.google.com/document/d/DOC_ID/edit
        const docIdMatch = trimmedUrl.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
        if (docIdMatch) {
          const docId = docIdMatch[1];
          // Try direct file access first, fallback to export
          return `https://drive.google.com/uc?export=view&id=${docId}`;
        }
      }
      // Handle Google Sheets URLs - Use direct file access instead of export
      else if (trimmedUrl.includes('docs.google.com/spreadsheets/')) {
        // Format: https://docs.google.com/spreadsheets/d/SHEET_ID/edit
        const sheetIdMatch = trimmedUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (sheetIdMatch) {
          const sheetId = sheetIdMatch[1];
          // Try direct file access first, fallback to export
          return `https://drive.google.com/uc?export=view&id=${sheetId}`;
        }
      }
      // Handle Google Slides URLs - Use direct file access instead of export
      else if (trimmedUrl.includes('docs.google.com/presentation/')) {
        // Format: https://docs.google.com/presentation/d/SLIDE_ID/edit
        const slideIdMatch = trimmedUrl.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
        if (slideIdMatch) {
          const slideId = slideIdMatch[1];
          // Try direct file access first, fallback to export
          return `https://drive.google.com/uc?export=view&id=${slideId}`;
        }
      }
      // Handle Google Drive folder URLs
      else if (trimmedUrl.includes('drive.google.com/drive/')) {
        // Format: https://drive.google.com/drive/folders/FOLDER_ID
        const folderIdMatch = trimmedUrl.match(/\/folders\/([a-zA-Z0-9-_]+)/);
        if (folderIdMatch) {
          const folderId = folderIdMatch[1];
          return `https://drive.google.com/drive/folders/${folderId}`;
        }
      }
      // Handle other Google URLs (Gmail, etc.)
      else if (trimmedUrl.includes('google.com/') || trimmedUrl.includes('gmail.com/')) {
        // For Gmail and other Google services, return as-is
        return trimmedUrl;
      }
      // Handle regular HTTP/HTTPS URLs
      else if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        return trimmedUrl;
      }

      // If we get here, it's not a recognizable URL format
      return null;
    } catch (error) {
      console.error('Error converting Google URL:', error);
      return logoUrl; // Return original URL as fallback
    }
  }

  /**
   * Convert URL to Notion file format with proper upload
   */
  async toNotionFile(url) {
    if (!url || !url.trim()) {
      console.log(`⚠️ Empty URL provided to toNotionFile`);
      return null;
    }
    
    console.log(`📎 Processing file URL: ${url}`);
    const convertedUrl = this.convertGoogleDriveUrl(url.trim());
    console.log(`📎 Converted file URL: ${convertedUrl}`);
    
    if (!convertedUrl) {
      console.log(`⚠️ Could not convert file URL: ${url}`);
      return null;
    }
    
    try {
      // Step 1: Create file upload object in Notion
      console.log(`📤 Creating file upload object in Notion...`);
      const uploadResponse = await fetch(`${this.notionApiBase}/file_uploads`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          mode: 'single_part',
          filename: 'file',
          content_type: 'application/octet-stream'
        })
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.log(`⚠️ Failed to create upload object: ${uploadResponse.status} ${uploadResponse.statusText}`);
        console.log(`📄 Upload error details: ${errorText}`);
        console.log(`📤 Upload request URL: ${this.notionApiBase}/file_uploads`);
        console.log(`📤 Upload request headers:`, {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        });
        return this.createExternalFile(convertedUrl);
      }
      
      const uploadData = await uploadResponse.json();
      console.log(`✅ Created upload object: ${uploadData.id}`);
      console.log(`📤 Upload data:`, JSON.stringify(uploadData, null, 2));
      
      // Step 2: Download file using Google Drive API
      console.log(`⬇️ Downloading file using Google Drive API: ${convertedUrl}`);
      
      let fileBuffer;
      try {
        // Extract file ID from URL
        const fileIdMatch = convertedUrl.match(/id=([a-zA-Z0-9-_]+)/);
        if (!fileIdMatch) {
          throw new Error('Could not extract file ID from URL');
        }
        
        const fileId = fileIdMatch[1];
        console.log(`📁 File ID: ${fileId}`);
        
        // First, get file metadata to determine the correct export format
        const fileMetadata = await this.drive.files.get({
          fileId: fileId,
          fields: 'mimeType,name',
          supportsAllDrives: true // Required for shared drives
        });
        
        console.log(`📄 File: ${fileMetadata.data.name} (${fileMetadata.data.mimeType})`);
        
        let exportMimeType = null;
        let fileExtension = '.pdf';
        
        // Determine file extension from MIME type for regular files
        if (fileMetadata.data.mimeType.includes('image/png')) {
          fileExtension = '.png';
        } else if (fileMetadata.data.mimeType.includes('image/jpeg') || fileMetadata.data.mimeType.includes('image/jpg')) {
          fileExtension = '.jpg';
        } else if (fileMetadata.data.mimeType.includes('image/svg')) {
          fileExtension = '.svg';
        } else if (fileMetadata.data.mimeType.includes('image/gif')) {
          fileExtension = '.gif';
        } else if (fileMetadata.data.mimeType.includes('image/webp')) {
          fileExtension = '.webp';
        } else if (fileMetadata.data.mimeType.includes('application/pdf')) {
          fileExtension = '.pdf';
        } else if (fileMetadata.data.mimeType.includes('presentationml')) {
          fileExtension = '.pptx';
        } else if (fileMetadata.data.mimeType.includes('spreadsheetml')) {
          fileExtension = '.xlsx';
        } else if (fileMetadata.data.mimeType.includes('wordprocessingml')) {
          fileExtension = '.docx';
        }
        
        // Determine export format based on MIME type
        if (fileMetadata.data.mimeType.includes('document') && fileMetadata.data.mimeType.includes('google-apps')) {
          exportMimeType = 'application/pdf';
          fileExtension = '.pdf';
        } else if (fileMetadata.data.mimeType.includes('spreadsheet') && fileMetadata.data.mimeType.includes('google-apps')) {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          fileExtension = '.xlsx';
        } else if (fileMetadata.data.mimeType.includes('presentation') && fileMetadata.data.mimeType.includes('google-apps')) {
          exportMimeType = 'application/pdf';
          fileExtension = '.pdf';
        }
        
        let response;
        if (exportMimeType) {
          // Use export for Google Docs/Sheets/Slides
          console.log(`📤 Exporting as ${exportMimeType}`);
          response = await this.drive.files.export({
            fileId: fileId,
            mimeType: exportMimeType,
            supportsAllDrives: true // Required for shared drives
          }, {
            responseType: 'arraybuffer'
          });
        } else {
          // Use direct download for regular files
          console.log(`📥 Direct download`);
          response = await this.drive.files.get({
            fileId: fileId,
            alt: 'media',
            supportsAllDrives: true // Required for shared drives
          }, {
            responseType: 'arraybuffer'
          });
        }
        
        fileBuffer = Buffer.from(response.data);
        console.log(`📦 Downloaded file: ${fileBuffer.length} bytes`);
        
        // Update filename with correct extension
        const originalName = fileMetadata.data.name || 'file';
        const cleanName = originalName.replace(/\.[^/.]+$/, '') + fileExtension;
        console.log(`📝 Using filename: ${cleanName}`);
        
      } catch (error) {
        console.log(`⚠️ Failed to download file via Google Drive API: ${error.message}`);
        console.log(`📎 Falling back to external link for: ${convertedUrl}`);
        return this.createExternalFile(convertedUrl);
      }
      
      // Step 3: Upload file to Notion
      console.log(`📤 Uploading file to Notion...`);
      console.log(`📤 Upload URL: ${uploadData.upload_url}`);
      console.log(`📤 File size: ${fileBuffer.length} bytes`);
      
      const uploadResult = await fetch(uploadData.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuffer.length.toString()
        },
        body: fileBuffer
      });
      
      if (!uploadResult.ok) {
        const errorText = await uploadResult.text();
        console.log(`⚠️ Failed to upload file: ${uploadResult.status} ${uploadResult.statusText}`);
        console.log(`📄 Error details: ${errorText}`);
        return this.createExternalFile(convertedUrl);
      }
      
      console.log(`✅ File uploaded successfully to Notion`);
      
      // Extract filename
      let filename = 'Document';
      let fileExtension = '.pdf'; // Default to PDF
      
      try {
        const urlObj = new URL(convertedUrl);
        const pathname = urlObj.pathname;
        filename = pathname.split('/').pop() || 'Document';
        
        // Clean up filename - remove query parameters
        filename = filename.split('?')[0];
        
        // Determine file extension based on URL
        if (convertedUrl.includes('/export?format=pdf')) {
          fileExtension = '.pdf';
        } else if (convertedUrl.includes('drive.google.com/uc')) {
          // Try to determine from content type or use default
          const contentType = fileResponse.headers.get('content-type');
          if (contentType) {
            if (contentType.includes('pdf')) fileExtension = '.pdf';
            else if (contentType.includes('image')) fileExtension = '.jpg';
            else if (contentType.includes('presentation')) fileExtension = '.pptx';
            else if (contentType.includes('document')) fileExtension = '.docx';
            else if (contentType.includes('spreadsheet')) fileExtension = '.xlsx';
          }
        }
        
        // Clean up filename
        filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!filename || filename === '' || filename === 'export') {
          filename = 'Document';
        }
        
        // Add extension if not present
        if (!filename.includes('.')) {
          filename += fileExtension;
        }
        
      } catch (e) {
        console.log(`⚠️ Could not extract filename from URL: ${convertedUrl}`);
        filename = 'Document' + fileExtension;
      }
      
      return {
        type: 'file',
        name: filename,
        file: {
          id: uploadData.id
        }
      };
      
    } catch (error) {
      console.error(`❌ Error uploading file:`, error);
      return this.createExternalFile(convertedUrl);
    }
  }
  
  /**
   * Create external file as fallback
   */
  createExternalFile(url) {
    console.log(`📎 Creating external file link: ${url}`);
    return {
      type: 'external',
      name: url.split('/').pop() || 'Document',
      external: { url }
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main sync function
   */
  async sync() {
    console.log('🚀 Starting Notion Client Database Sync...\n');
    
    try {
      // Initialize Google Sheets
      await this.initializeSheets();
      
      // Read client data
      const { clients, headerMap } = await this.readClients();
      
      if (this.dryRun) {
        console.log('🧪 DRY RUN MODE - No changes will be made');
        console.log('📊 Would sync clients:', clients.length);
        return;
      }
      
      // Get Notion database schema
      const database = await this.getDatabaseSchema();
      if (!database) {
        throw new Error('Failed to get database schema');
      }
      
      const schema = database.properties || {};
      const titleProp = Object.keys(schema).find(k => schema[k].type === 'title');
      if (!titleProp) {
        throw new Error('No title property in Notion database.');
      }
      
      console.log(`📋 Detected title property: "${titleProp}"`);
      
      // Get existing pages
      const existingPages = await this.queryAllPages();
      const byTitle = {};
      existingPages.forEach(p => {
        const t = this.getTitleFromPage(p, titleProp);
        if (t) byTitle[t] = p;
      });
      
      // Process clients
      let created = 0, updated = 0, errors = 0;
      const sheetTitles = new Set();
      
      for (let i = 0; i < clients.length; i++) {
        try {
          const client = clients[i];
          const row = Object.keys(headerMap).map(header => client[header]);
          const { props, coverUrl } = await this.buildPropsFromRow(row, headerMap, schema, titleProp);
          const titleText = props[titleProp]?.title?.[0]?.text?.content || '';
          const logKey = `${titleText || '(no title)'} @row=${i + 2}`;

          if (!titleText) {
            console.log(`⚠️  Skipping row ${i + 2}: empty "${titleProp}"`);
            continue;
          }
          
          console.log(`\n📋 Processing ${logKey}:`);
          console.log(`   Properties:`, Object.keys(props));
          console.log(`   Cover URL: ${coverUrl || 'None'}`);
          
          sheetTitles.add(titleText);

          const existing = byTitle[titleText];
          if (existing) {
            console.log(`📝 Row ${i + 2}: updating "${titleText}"...`);
            await this.updatePage(existing.id, props, logKey, coverUrl);
            updated++;
          } else {
            console.log(`📝 Row ${i + 2}: creating "${titleText}"...`);
            await this.createPage(props, logKey, coverUrl);
            created++;
          }

          await this.sleep(this.config.RATE_LIMIT_MS);
        } catch (error) {
          errors++;
          console.error(`❌ Row ${i + 2} error:`, error);
        }
      }
      
      // Archive pages that are no longer in the sheet
      let archived = 0;
      for (const title of Object.keys(byTitle)) {
        if (!sheetTitles.has(title)) {
          try {
            await this.archivePage(byTitle[title].id, title);
            archived++;
            await this.sleep(this.config.RATE_LIMIT_MS);
          } catch (error) {
            console.error(`❌ Archive failed for "${title}":`, error);
          }
        }
      }
      
      console.log('\n🎉 Sync completed successfully!');
      console.log('📊 Sync Summary:');
      console.log(`  • Created: ${created}`);
      console.log(`  • Updated: ${updated}`);
      console.log(`  • Archived: ${archived}`);
      console.log(`  • Errors: ${errors}`);
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const sync = new NotionClientSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('notion-client-sync.js')) {
  main();
}

export default NotionClientSync;
