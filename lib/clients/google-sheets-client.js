#!/usr/bin/env node

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

class GoogleSheetsClient {
  constructor() {
    this.sheets = null;
    this.initializeAuth();
  }

  /**
   * Initialize Google Sheets API authentication
   */
  initializeAuth() {
    try {
      // Use service account authentication
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
    } catch (error) {
      console.error('Failed to initialize Google Sheets authentication:', error);
      throw error;
    }
  }

  /**
   * Test connection to Google Sheets
   */
  async testConnection() {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets not initialized');
      }

      const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEETS_ID not set in environment variables');
      }

      // Try to get spreadsheet metadata
      await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });

      console.log('✅ Google Sheets connection successful');
      return true;
    } catch (error) {
      console.error('❌ Google Sheets connection failed:', error.message);
      return false;
    }
  }

  /**
   * Get all clients from Google Sheets
   */
  async getClients() {
    try {
      const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
      
      console.log(`📊 Fetching clients from Google Sheets: ${spreadsheetId}`);
      
      // First, get the sheet metadata to find the actual data range
      const sheetMetadata = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });
      
      // Get the first sheet (tab)
      const firstSheet = sheetMetadata.data.sheets[0];
      const sheetName = firstSheet.properties.title;
      
      console.log(`📊 Found sheet: "${sheetName}"`);
      
      // Try to find the actual data range by looking for the "Client Database" table
      // First, get a large range to scan for data
      const scanRange = `${sheetName}!A1:Z1000`;
      
      const scanResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: scanRange
      });
      
      const allRows = scanResponse.data.values || [];
      
      // Find the header row (look for "Client Name" or similar)
      let headerRowIndex = -1;
      let dataStartRow = -1;
      
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        if (row && row.length > 0) {
          const firstCell = row[0]?.toString().toLowerCase();
          if (firstCell && (firstCell.includes('client name') || firstCell.includes('client') || firstCell.includes('name'))) {
            headerRowIndex = i;
            dataStartRow = i + 1; // Data starts after header
            break;
          }
        }
      }
      
      if (headerRowIndex === -1) {
        console.log('⚠️ Could not find header row, using default range');
        // Fallback to default range
        const range = process.env.GOOGLE_SHEETS_RANGE || `${sheetName}!A:F`;
        console.log(`📊 Using fallback range: ${range}`);
        
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          range: range
        });
        
        return this.processClientData(response.data.values);
      }
      
      // Find the last row with data
      let lastDataRow = dataStartRow;
      for (let i = dataStartRow; i < allRows.length; i++) {
        const row = allRows[i];
        if (row && row.length > 0 && row.some(cell => cell && cell.toString().trim() !== '')) {
          lastDataRow = i;
        }
      }
      
      // Find the last column with data
      let lastDataColumn = 0;
      for (let i = dataStartRow; i <= lastDataRow; i++) {
        const row = allRows[i];
        if (row) {
          for (let j = row.length - 1; j >= 0; j--) {
            if (row[j] && row[j].toString().trim() !== '') {
              lastDataColumn = Math.max(lastDataColumn, j);
              break;
            }
          }
        }
      }
      
      // Create range from header to last data
      const columnLetter = String.fromCharCode(65 + lastDataColumn); // A=65, B=66, etc.
      const range = `${sheetName}!A${headerRowIndex + 1}:${columnLetter}${lastDataRow + 1}`;
      
      console.log(`📊 Using dynamic range: ${range} (${lastDataRow - dataStartRow + 1} data rows)`);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range
      });

      return this.processClientData(response.data.values);

    } catch (error) {
      console.error('Error fetching clients from Google Sheets:', error);
      throw error;
    }
  }

  /**
   * Process client data from Google Sheets rows
   */
  processClientData(rows) {
    if (!rows || rows.length === 0) {
      console.log('No data found in Google Sheets');
      return [];
    }

    // Skip header row if it exists
    const dataRows = rows.slice(1);
    
    console.log(`\n📋 Processing ${dataRows.length} rows from Google Sheets:`);
    console.log('=' .repeat(80));
    
    // Get header row to determine column mapping
    const headerRow = rows[0] || [];
    const columnMap = {};
    
    // Map column headers to their indices - using exact column names for essential fields only
    headerRow.forEach((header, index) => {
      const normalizedHeader = header?.toString().toLowerCase().trim();
      
      // Map to essential fields only
      if (normalizedHeader === 'client name') {
        columnMap.name = index;
      } else if (normalizedHeader === 'website') {
        columnMap.website = index;
      } else if (normalizedHeader === 'country') {
        columnMap.country = index;
      } else if (normalizedHeader === 'gtm vertical') {
        columnMap.industry = index;
      } else if (normalizedHeader === 'project type') {
        columnMap.projectType = index;
      } else if (normalizedHeader === 'client logo') {
        columnMap.logoUrl = index;
      } else if (normalizedHeader === 'cycle (fall/spring [year])') {
        columnMap.cycle = index;
      }
    });
    
    console.log('📋 Column mapping detected:', columnMap);
    
    const clients = dataRows
      .map((row, index) => {
        // Map columns by header names - essential fields only
        const name = row[columnMap.name];
        const website = row[columnMap.website];
        const country = row[columnMap.country];
        const industry = row[columnMap.industry];
        const projectType = row[columnMap.projectType];
        const logoUrl = row[columnMap.logoUrl];
        const cycle = row[columnMap.cycle];
        
        console.log(`\n📄 Row ${index + 2}:`);
        console.log(`   Name: "${name || 'MISSING'}"`);
        console.log(`   Website: "${website || 'MISSING'}"`);
        console.log(`   Industry: "${industry || 'MISSING'}"`);
        console.log(`   Logo URL: "${logoUrl || 'MISSING'}"`);
        console.log(`   Country: "${country || 'N/A'}"`);
        console.log(`   Project Type: "${projectType || 'N/A'}"`);
        console.log(`   Cycle: "${cycle || 'N/A'}"`);
        
        // Identify logo file type
        if (logoUrl) {
          const logoFileType = this.identifyLogoFileType(logoUrl);
          console.log(`   Logo File Type: ${logoFileType}`);
        }
        
        // Only include clients with all required fields (name, website, industry, logo)
        if (!name || !website || !industry || !logoUrl) {
          console.warn(`   ❌ SKIPPING: Missing required fields`);
          return null;
        }

        // Ensure website URL has protocol
        let websiteUrl = website.trim();
        if (websiteUrl && !websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
          websiteUrl = `https://${websiteUrl}`;
        }

        const client = {
          name: name.trim(),
          website: websiteUrl,
          industry: industry.trim(),
          logoUrl: logoUrl.trim(),
          country: country ? country.trim() : '',
          projectType: projectType ? projectType.trim() : '',
          cycle: cycle ? cycle.trim() : ''
        };
        
        console.log(`   ✅ VALID: Will be synced to Sanity`);
        if (websiteUrl !== website.trim()) {
          console.log(`   🔗 Website URL corrected: "${website.trim()}" → "${websiteUrl}"`);
        }
        return client;
      })
      .filter(client => client !== null);

    console.log('\n' + '=' .repeat(80));
    console.log(`📊 Summary: Found ${clients.length} valid clients out of ${dataRows.length} rows`);
    
    if (clients.length > 0) {
      console.log('\n🎯 Clients that will be synced:');
      clients.forEach((client, index) => {
        console.log(`   ${index + 1}. ${client.name} (${client.industry}) - ${client.website}`);
        if (client.country) console.log(`      Country: ${client.country}`);
        if (client.projectType) console.log(`      Project Type: ${client.projectType}`);
      });
    }
    
    return clients;
  }

  /**
   * Identify the file type of a logo URL
   */
  identifyLogoFileType(logoUrl) {
    try {
      // Check for common file extensions
      const url = logoUrl.toLowerCase();
      
      if (url.includes('.jpg') || url.includes('.jpeg')) return 'JPEG';
      if (url.includes('.png')) return 'PNG';
      if (url.includes('.avif')) return 'AVIF';
      if (url.includes('.gif')) return 'GIF';
      if (url.includes('.svg')) return 'SVG';
      if (url.includes('.webp')) return 'WebP';
      if (url.includes('.bmp')) return 'BMP';
      if (url.includes('.tiff') || url.includes('.tif')) return 'TIFF';
      
      // Check for Google Drive URLs
      if (url.includes('drive.google.com')) {
        return 'Google Drive (supports JPG, PNG, GIF, SVG, WebP, BMP, TIFF)';
      }
      
      // Check for other common image hosting
      if (url.includes('imgur.com')) return 'Imgur (format unknown)';
      if (url.includes('cloudinary.com')) return 'Cloudinary (format unknown)';
      if (url.includes('amazonaws.com')) return 'AWS S3 (format unknown)';
      
      return 'Unknown format';
    } catch (error) {
      return 'Error identifying format';
    }
  }

  /**
   * Convert Google Drive logo URL to accessible URL
   */
  convertGoogleDriveUrl(logoUrl) {
    try {
      // Handle different Google Drive URL formats
      if (logoUrl.includes('drive.google.com/file/d/')) {
        // Format: https://drive.google.com/file/d/FILE_ID/view
        const fileIdMatch = logoUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
      } else if (logoUrl.includes('drive.google.com/open')) {
        // Format: https://drive.google.com/open?id=FILE_ID
        const fileIdMatch = logoUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
      } else if (logoUrl.includes('drive.google.com/uc')) {
        // Already in the correct format
        return logoUrl;
      }

      console.warn(`Could not convert Google Drive URL: ${logoUrl}`);
      return logoUrl; // Return original URL as fallback
    } catch (error) {
      console.error('Error converting Google Drive URL:', error);
      return logoUrl; // Return original URL as fallback
    }
  }
}

export default GoogleSheetsClient;
