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
  async buildPropsFromRow(row, headerMap, schema, titleProp, isUpdate = false, existingProps = {}) {
    const props = {};
    
    console.log(`🔍 Available columns:`, Object.keys(schema));
    console.log(`🔍 Header map keys:`, Object.keys(headerMap));
    
    for (const propName in schema) {
      // Find matching header (case insensitive)
      let idx = headerMap[propName];
      if (idx === undefined) {
        // Try case insensitive match
        const matchingHeader = Object.keys(headerMap).find(header => 
          header.toLowerCase() === propName.toLowerCase()
        );
        if (matchingHeader) {
          idx = headerMap[matchingHeader];
        }
      }
      if (idx === undefined) continue; // header not present in sheet
      const notionType = schema[propName].type;

      // Title must always be set even if empty
      if (propName === titleProp) {
        const raw = row[idx];
        const titleText = (raw && String(raw).trim()) ? String(raw).trim() : 'Untitled';
        props[propName] = { title: [{ text: { content: titleText } }] };
        continue;
      }

      const cell = row[idx];
      
      // For updates, skip properties that already have values (add-only logic)
      if (isUpdate && existingProps[propName]) {
        const existingValue = existingProps[propName];
        // Check if the existing value is not empty
        if (existingValue && 
            (existingValue.title?.[0]?.text?.content?.trim() || 
             existingValue.rich_text?.[0]?.text?.content?.trim() ||
             existingValue.url?.trim() ||
             existingValue.email?.trim() ||
             existingValue.number !== null ||
             existingValue.select?.name?.trim() ||
             existingValue.multi_select?.length > 0 ||
             existingValue.files?.length > 0 ||
             existingValue.phone_number?.trim() ||
             existingValue.date?.start)) {
          console.log(`⏭️ Skipping "${propName}" - already has value`);
          continue;
        }
      }
      
      // Handle file properties as external links only
      if (notionType === 'files' && cell && cell.trim() !== '') {
        console.log(`📄 Processing file column "${propName}" with value: "${cell}"`);
        const fileUrl = cell.trim();
        if (fileUrl) {
          // Create external file link
          const fileObj = {
            type: 'external',
            name: fileUrl.split('/').pop() || 'Document',
            external: { url: fileUrl }
          };
          props[propName] = { files: [fileObj] };
          console.log(`✅ Added external file link to property "${propName}"`);
        } else {
          console.log(`⚠️ No valid file URL found for "${propName}"`);
        }
        continue;
      }
      
      const pv = this.valueToNotionProp(cell, notionType);
      if (pv) props[propName] = pv;
    }
    
    // For new pages, set Archive to "Not Archived"
    if (!isUpdate) {
      props.Archive = { select: { name: 'Not Archived' } };
    }
    
    return { props };
  }

  /**
   * Create page in Notion
   */
  async createPage(properties, logKey) {
    try {
      const pageData = {
        parent: { database_id: this.notionDatabaseId },
        properties
      };

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
  async updatePage(pageId, properties, logKey) {
    try {
      const updateData = { properties };

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
   * Set Archived property in Notion page
   */
  async setArchivedProperty(pageId, logKey, isArchived = true) {
    try {
      const response = await fetch(`${this.notionApiBase}/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': this.notionApiVersion,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          properties: {
            Archive: {
              select: { name: isArchived ? 'Archived' : 'Not Archived' }
            }
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Notion archive property update failed [${response.status}]: ${error}`);
      }

      console.log(`✅ Set Archive property to "${isArchived ? 'Archived' : 'Not Archived'}" for: ${logKey} | id=${pageId}`);
    } catch (error) {
      console.error(`❌ Error setting Archive property for ${logKey}:`, error);
      throw error;
    }
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
          const titleText = row[headerMap[titleProp]] || '';
          const logKey = `${titleText || '(no title)'} @row=${i + 2}`;

          if (!titleText) {
            console.log(`⚠️  Skipping row ${i + 2}: empty "${titleProp}"`);
            continue;
          }
          
          console.log(`\n📋 Processing ${logKey}:`);
          
          sheetTitles.add(titleText);

          const existing = byTitle[titleText];
          if (existing) {
            console.log(`📝 Row ${i + 2}: updating "${titleText}"...`);
            // Get existing properties for add-only logic
            const existingProps = existing.properties || {};
            const { props } = await this.buildPropsFromRow(row, headerMap, schema, titleProp, true, existingProps);
            await this.updatePage(existing.id, props, logKey);
            updated++;
          } else {
            console.log(`📝 Row ${i + 2}: creating "${titleText}"...`);
            const { props } = await this.buildPropsFromRow(row, headerMap, schema, titleProp, false);
            await this.createPage(props, logKey);
            created++;
          }

          await this.sleep(this.config.RATE_LIMIT_MS);
        } catch (error) {
          errors++;
          console.error(`❌ Row ${i + 2} error:`, error);
        }
      }
      
      // Set Archived property for pages that are no longer in the sheet
      let archived = 0;
      for (const title of Object.keys(byTitle)) {
        if (!sheetTitles.has(title)) {
          try {
            await this.setArchivedProperty(byTitle[title].id, title, true);
            archived++;
            await this.sleep(this.config.RATE_LIMIT_MS);
          } catch (error) {
            console.error(`❌ Archive property update failed for "${title}":`, error);
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
