#!/usr/bin/env node

/**
 * Notion Member Database Sync
 * 
 * Migrated from Google Apps Script to GitHub Actions
 * Syncs Google Sheets member data with Notion database
 * 
 * Features:
 * - Incremental sync (updates existing, creates new, archives missing)
 * - Slack profile picture integration
 * - Phone number cleaning
 * - Project handling
 * - Status filtering (only Active members)
 */

import { google } from 'googleapis';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

class NotionMemberSync {
  constructor() {
    // Validate required environment variables
    this.validateEnvironment();
    
    this.sheets = null;
    this.sheetsId = this.extractSheetId(process.env.GSHEET_MEMBERS_LINK);
    this.notionToken = process.env.NOTION_TOKEN;
    this.notionDatabaseId = process.env.NOTION_MEMBER_DATABASE;
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.dryRun = process.env.DRY_RUN === 'true';
    
    this.notionApiBase = 'https://api.notion.com/v1';
    this.notionApiVersion = '2022-06-28';
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const required = [
      'GSHEET_MEMBERS_LINK',
      'GOOGLE_PROJECT_ID',
      'GOOGLE_PRIVATE_KEY_ID',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_CLIENT_ID',
      'NOTION_TOKEN',
      'NOTION_MEMBER_DATABASE',
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
      throw new Error('GSHEET_MEMBERS_LINK environment variable is required');
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
   * Read member data from Google Sheets
   */
  async readMembers() {
    try {
      console.log('📊 Reading member data from Google Sheets...');
      
      // First, get the spreadsheet metadata to find the correct sheet name
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetsId
      });
      
      const sheets = spreadsheet.data.sheets || [];
      console.log(`📋 Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
      
      // Find the sheet that matches our target name (case-insensitive)
      const targetSheet = sheets.find(sheet => 
        sheet.properties?.title?.toLowerCase() === 'members'
      );
      
      if (!targetSheet) {
        throw new Error(`Sheet "Members" not found. Available sheets: ${sheets.map(s => s.properties?.title).join(', ')}`);
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
      
      // Find column indices by name
      const getColumnIndex = (columnName) => {
        for (let i = 0; i < headers.length; i++) {
          if (headers[i] && headers[i].toString().toLowerCase().includes(columnName.toLowerCase())) {
            return i;
          }
        }
        return -1;
      };
      
      const columnIndices = {
        name: getColumnIndex('Full Name') !== -1 ? getColumnIndex('Full Name') : 0,
        position: getColumnIndex('Position') !== -1 ? getColumnIndex('Position') : 3,
        department: getColumnIndex('Department') !== -1 ? getColumnIndex('Department') : 4,
        campus: getColumnIndex('Campus') !== -1 ? getColumnIndex('Campus') : 5,
        program: getColumnIndex('Program') !== -1 ? getColumnIndex('Program') : 6,
        status: getColumnIndex('Status') !== -1 ? getColumnIndex('Status') : 7,
        email: getColumnIndex('Email 180') !== -1 ? getColumnIndex('Email 180') : 9,
        phone: getColumnIndex('Phone') !== -1 ? getColumnIndex('Phone') : 11,
        projects: getColumnIndex('Projects') !== -1 ? getColumnIndex('Projects') : 19
      };
      
      console.log('📋 Using column indices:', columnIndices);
      
      // Transform rows to member objects
      const members = dataRows.map((row, index) => {
        // Clean phone number - convert from scientific notation if needed
        let phoneNumber = row[columnIndices.phone] || '';
        if (typeof phoneNumber === 'number' && phoneNumber.toString().includes('e')) {
          phoneNumber = phoneNumber.toFixed(0);
        }
        phoneNumber = phoneNumber.toString().trim();
        
        // Add "+" if phone number doesn't start with it
        if (phoneNumber && !phoneNumber.startsWith('+')) {
          phoneNumber = '+' + phoneNumber;
        }

        return {
          name: row[columnIndices.name] || '',
          position: row[columnIndices.position] || '',
          department: row[columnIndices.department] || '',
          campus: row[columnIndices.campus] || '',
          program: row[columnIndices.program] || '',
          status: row[columnIndices.status] || '',
          email: row[columnIndices.email] || '',
          phone: phoneNumber,
          projects: row[columnIndices.projects] || '',
          rowIndex: index + 2
        };
      }).filter(member => member.name.trim()); // Only include members with names

      console.log(`📊 Loaded ${members.length} members from sheet`);
      return { members, columnIndices };
    } catch (error) {
      console.error('❌ Error reading members from sheet:', error);
      throw error;
    }
  }

  /**
   * Get Slack user profile picture by email
   */
  async getSlackProfilePicture(email) {
    try {
      if (!email || !email.trim()) {
        console.log('📧 No email provided for Slack lookup');
        return null;
      }

      const result = await this.slack.users.lookupByEmail({ email: email.trim() });
      
      if (!result.ok) {
        console.log(`📧 User not found in Slack for email ${email}: ${result.error}`);
        return null;
      }

      const user = result.user;
      const profilePicture = user.profile?.image_512 || user.profile?.image_192 || user.profile?.image_72;
      
      if (profilePicture) {
        console.log(`📧 Found Slack profile picture for ${email}: ${profilePicture}`);
        return profilePicture;
      } else {
        console.log(`📧 No profile picture found for ${email} in Slack`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error getting Slack profile picture for ${email}:`, error);
      return null;
    }
  }

  /**
   * Set cover image for a Notion page
   */
  async setNotionPageCover(pageId, coverUrl) {
    try {
      const response = await fetch(`${this.notionApiBase}/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.notionApiVersion
        },
        body: JSON.stringify({
          cover: {
            type: 'external',
            external: {
              url: coverUrl
            }
          }
        })
      });

      if (response.ok) {
        console.log(`✅ Set cover image for page ${pageId}`);
        return true;
      } else {
        const error = await response.text();
        console.error(`❌ Failed to set cover for page ${pageId}: ${error}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error setting cover for page ${pageId}:`, error);
      return false;
    }
  }

  /**
   * Get all existing pages from the Notion database
   */
  async getExistingPages() {
    try {
      const response = await fetch(`${this.notionApiBase}/databases/${this.notionDatabaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.notionApiVersion
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        const result = await response.json();
        return result.results;
      } else {
        const error = await response.text();
        console.error('❌ Failed to get existing pages:', error);
        return [];
      }
    } catch (error) {
      console.error('❌ Error getting existing pages:', error);
      return [];
    }
  }

  /**
   * Safely extract member name from Notion page
   */
  getMemberNameFromPage(page) {
    try {
      if (!page || !page.properties) {
        return '';
      }
      
      // Find the title property (it's the one with type 'title')
      const titlePropertyName = Object.keys(page.properties).find(key => 
        page.properties[key].type === 'title'
      );
      
      if (!titlePropertyName) {
        return '';
      }
      
      const nameProperty = page.properties[titlePropertyName];
      if (!nameProperty.title || !Array.isArray(nameProperty.title) || nameProperty.title.length === 0) {
        return '';
      }
      
      const titleElement = nameProperty.title[0];
      if (!titleElement || !titleElement.text) {
        return '';
      }
      
      return titleElement.text.content || '';
    } catch (error) {
      console.error('❌ Error extracting member name from page:', error);
      return '';
    }
  }

  /**
   * Get database schema to understand available properties
   */
  async getDatabaseSchema() {
    try {
      console.log('🔍 Getting database schema...');
      
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
   * Create a page in the Notion database
   */
  async createNotionPage(memberData) {
    try {
      // Get database schema first to understand available properties
      const database = await this.getDatabaseSchema();
      if (!database) {
        throw new Error('Failed to get database schema');
      }

      // Build properties based on what's actually available in the database
      const properties = {};
      
      // Title property (required)
      const titleProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'title'
      );
      if (titleProperty) {
        properties[titleProperty] = {
          title: [
            {
              text: {
                content: memberData.name || 'Unknown Member'
              }
            }
          ]
        };
      }

      // Email property
      const emailProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'email'
      );
      if (emailProperty && memberData.email && memberData.email.trim()) {
        properties[emailProperty] = {
          email: memberData.email.trim()
        };
      }

      // Position property (select)
      const positionProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'select' && 
        key.toLowerCase().includes('position')
      );
      if (positionProperty && memberData.position) {
        properties[positionProperty] = {
          select: { name: memberData.position }
        };
      }

      // Department property (select)
      const departmentProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'select' && 
        key.toLowerCase().includes('department')
      );
      if (departmentProperty && memberData.department) {
        properties[departmentProperty] = {
          select: { name: memberData.department }
        };
      }

      // Campus property (select)
      const campusProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'select' && 
        key.toLowerCase().includes('campus')
      );
      if (campusProperty && memberData.campus) {
        properties[campusProperty] = {
          select: { name: memberData.campus }
        };
      }

      // Program property (select)
      const programProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'select' && 
        key.toLowerCase().includes('program')
      );
      if (programProperty && memberData.program) {
        properties[programProperty] = {
          select: { name: memberData.program }
        };
      }

      // Phone property
      const phoneProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'phone_number'
      );
      if (phoneProperty && memberData.phone) {
        properties[phoneProperty] = {
          phone_number: memberData.phone
        };
      }

      // Projects property (multi_select)
      const projectsProperty = Object.keys(database.properties).find(key => 
        database.properties[key].type === 'multi_select' && 
        key.toLowerCase().includes('project')
      );
      if (projectsProperty && memberData.projects) {
        properties[projectsProperty] = {
          multi_select: memberData.projects.split(', ').map(project => ({ name: project.trim() }))
        };
      }

      const pageData = {
        parent: {
          database_id: this.notionDatabaseId
        },
        properties
      };

      console.log(`📝 Creating page for ${memberData.name} with projects:`, memberData.projects);

      const response = await fetch(`${this.notionApiBase}/pages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.notionApiVersion
        },
        body: JSON.stringify(pageData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Created page for ${memberData.name}:`, result.id);
        
        // Try to set Slack profile picture as cover
        if (memberData.email) {
          const profilePicture = await this.getSlackProfilePicture(memberData.email);
          if (profilePicture) {
            await this.setNotionPageCover(result.id, profilePicture);
          }
        }
        
        return result;
      } else {
        const error = await response.text();
        console.error(`❌ Failed to create page: ${error}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error creating page for ${memberData.name}:`, error);
      return null;
    }
  }

  /**
   * Update an existing page in the Notion database
   */
  async updateNotionPage(pageId, memberData) {
    try {
      const pageData = {
        properties: {
          'Name': {
            title: [
              {
                text: {
                  content: memberData.name || 'Unknown Member'
                }
              }
            ]
          },
          'Email': {
            email: memberData.email && memberData.email.trim() ? memberData.email.trim() : null
          },
          'Position': {
            select: memberData.position ? { name: memberData.position } : null
          },
          'Department': {
            select: memberData.department ? { name: memberData.department } : null
          },
          'Campus': {
            select: memberData.campus ? { name: memberData.campus } : null
          },
          'Program': {
            select: memberData.program ? { name: memberData.program } : null
          },
          'Phone': {
            phone_number: memberData.phone || null
          },
          'Projects': {
            multi_select: memberData.projects ? 
              memberData.projects.split(', ').map(project => ({ name: project.trim() })) : []
          }
        }
      };

      console.log(`📝 Updating page for ${memberData.name} with projects:`, memberData.projects);

      const response = await fetch(`${this.notionApiBase}/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.notionApiVersion
        },
        body: JSON.stringify(pageData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Updated page for ${memberData.name}:`, result.id);
        
        // Try to set Slack profile picture as cover
        if (memberData.email) {
          const profilePicture = await this.getSlackProfilePicture(memberData.email);
          if (profilePicture) {
            await this.setNotionPageCover(result.id, profilePicture);
          }
        }
        
        return result;
      } else {
        const error = await response.text();
        console.error(`❌ Failed to update page: ${error}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error updating page for ${memberData.name}:`, error);
      return null;
    }
  }

  /**
   * Archive a Notion page
   */
  async archiveNotionPage(pageId) {
    try {
      const response = await fetch(`${this.notionApiBase}/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.notionApiVersion
        },
        body: JSON.stringify({
          archived: true
        })
      });
      
      if (response.ok) {
        console.log(`🗑️ Archived page: ${pageId}`);
        return true;
      } else {
        const error = await response.text();
        console.error(`❌ Failed to archive page ${pageId}: ${error}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error archiving page ${pageId}:`, error);
      return false;
    }
  }

  /**
   * Main sync function
   */
  async sync() {
    console.log('🚀 Starting Notion Member Database Sync...\n');
    
    try {
      // Initialize Google Sheets
      await this.initializeSheets();
      
      // Read member data
      const { members, columnIndices } = await this.readMembers();
      
      // Get existing pages to check for updates
      const existingPages = await this.getExistingPages();
      const existingMemberNames = existingPages.map(page => this.getMemberNameFromPage(page));

      let successCount = 0;
      let errorCount = 0;
      let updatedCount = 0;
      let createdCount = 0;

      // Process each member
      for (let i = 0; i < members.length; i++) {
        const memberData = members[i];
        
        try {
          // Skip if member name is empty
          if (!memberData.name.trim()) {
            console.log(`⏭️ Skipping row ${i + 2}: No member name`);
            continue;
          }

          // Skip if status is not "Active"
          if (memberData.status !== 'Active') {
            console.log(`⏭️ Skipping row ${i + 2}: Status is "${memberData.status}", not "Active"`);
            continue;
          }

          console.log(`📊 Processing member: ${memberData.name} (Status: ${memberData.status})`);

          // Check if member already exists
          const existingPage = existingPages.find(page => {
            const pageName = this.getMemberNameFromPage(page);
            return pageName === memberData.name;
          });

          if (existingPage) {
            // Update existing page
            const result = await this.updateNotionPage(existingPage.id, memberData);
            if (result) {
              successCount++;
              updatedCount++;
              console.log(`✅ Successfully updated page for ${memberData.name}`);
            } else {
              console.log(`❌ Failed to update page for ${memberData.name}`);
              errorCount++;
            }
          } else {
            // Create new page
            const result = await this.createNotionPage(memberData);
            if (result) {
              successCount++;
              createdCount++;
              console.log(`✅ Successfully created page for ${memberData.name}`);
            } else {
              console.log(`❌ Failed to create page for ${memberData.name}`);
              errorCount++;
            }
          }

          // Add a small delay to avoid rate limiting
          await this.sleep(500);

        } catch (error) {
          errorCount++;
          console.error(`❌ Error processing row ${i + 2}:`, error);
        }
      }

      // Clean up: Archive members that don't exist in the Google Sheet or are not Active
      console.log('\n🧹 Cleaning up: Checking for members to archive...');
      const activeMemberNames = members
        .filter(member => {
          const name = member.name?.toString().trim();
          const status = member.status?.toString().trim();
          return name && name.length > 0 && status === 'Active';
        })
        .map(member => member.name?.toString().trim());
      
      let archivedCount = 0;
      for (const page of existingPages) {
        const pageName = this.getMemberNameFromPage(page);
        if (pageName && !activeMemberNames.includes(pageName)) {
          try {
            await this.archiveNotionPage(page.id);
            archivedCount++;
          } catch (error) {
            console.error(`❌ Error archiving ${pageName}:`, error);
          }
        }
      }

      console.log(`\n🎉 Notion Member Database Sync completed!`);
      console.log(`📊 Summary:`);
      console.log(`  ✅ Successfully processed: ${successCount} active members`);
      console.log(`  🆕 Created: ${createdCount} new members`);
      console.log(`  🔄 Updated: ${updatedCount} existing members`);
      console.log(`  🗑️ Archived: ${archivedCount} inactive members`);
      console.log(`  ❌ Errors: ${errorCount} members`);

    } catch (error) {
      console.error('❌ Sync failed:', error);
      throw error;
    }
  }

  /**
   * Utility functions
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const sync = new NotionMemberSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('notion-member-sync.js')) {
  main();
}

export default NotionMemberSync;
