/**
 * Notion Client for meeting notes integration
 */

import dotenv from 'dotenv';

dotenv.config();

class NotionClient {
  constructor() {
    this.token = process.env.NOTION_TOKEN;
    this.apiBase = 'https://api.notion.com/v1';
    this.apiVersion = '2025-09-03';
    this.meetingDatabaseId = process.env.MEETING_DATABASE_ID;
  }

  /**
   * Test Notion connection
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.apiBase}/users/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': this.apiVersion
        }
      });

      if (response.ok) {
        const user = await response.json();
        console.log('✅ Notion connection successful!');
        console.log('👤 Connected as:', user.name);
        return true;
      } else {
        const error = await response.text();
        console.error('❌ Notion connection failed:', error);
        return false;
      }
    } catch (error) {
      console.error('❌ Notion connection error:', error);
      return false;
    }
  }

  /**
   * Get data source ID from database ID (required for 2025-09-03 API)
   */
  async getDataSourceId() {
    try {
      console.log(`🔍 Getting data source ID for database: ${this.meetingDatabaseId}`);
      
      const response = await fetch(`${this.apiBase}/databases/${this.meetingDatabaseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': this.apiVersion
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

  /**
   * Get database schema
   */
  async getDatabaseSchema() {
    try {
      console.log('🔍 Getting database schema...');
      
      const response = await fetch(`${this.apiBase}/databases/${this.meetingDatabaseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': this.apiVersion
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
   * Create a meeting notes database if it doesn't exist
   */
  async createMeetingDatabase() {
    try {
      console.log('🏗️ Creating meeting notes database...');
      
      const databaseProperties = {
        parent: {
          page_id: '27273333-ed75-80fe-94cc-eecc4eb76dc2' // The page ID from your Notion URL
        },
        title: [
          {
            text: {
              content: 'Meeting Notes'
            }
          }
        ],
        properties: {
          'Meeting Title': {
            title: {}
          },
          'Start Time': {
            date: {}
          },
          'End Time': {
            date: {}
          },
          'Participants': {
            rich_text: {}
          },
          'Owner': {
            rich_text: {}
          },
          'Summary': {
            rich_text: {}
          },
          'Action Items': {
            rich_text: {}
          },
          'Key Questions': {
            rich_text: {}
          },
          'Topics': {
            rich_text: {}
          },
          'Report URL': {
            url: {}
          },
          'Session ID': {
            rich_text: {}
          }
        }
      };

      const response = await fetch(`${this.apiBase}/databases`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.apiVersion
        },
        body: JSON.stringify(databaseProperties)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Database created successfully!');
        console.log('🆔 Database ID:', result.id);
        return result;
      } else {
        const error = await response.text();
        console.error('❌ Failed to create database:', error);
        return null;
      }
    } catch (error) {
      console.error('❌ Error creating database:', error);
      return null;
    }
  }

  /**
   * Create a new meeting notes page with retry logic (updated for 2025-09-03 API)
   */
  async createMeetingPage(meetingData, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`📝 Creating meeting page for: ${meetingData.title} (attempt ${attempt}/${retries})`);
        
        // Get data source ID first (required for 2025-09-03 API)
        const dataSourceId = await this.getDataSourceId();
        if (!dataSourceId) {
          console.error('❌ Could not get data source ID for database');
          throw new Error('Could not get data source ID');
        }
        
        // Format participants array as text
        const participantsText = Array.isArray(meetingData.participants) 
          ? meetingData.participants.join(', ') 
          : meetingData.participants || '';

        // Format action items array as text
        const actionItemsText = Array.isArray(meetingData.action_items) 
          ? meetingData.action_items.join('\n• ') 
          : meetingData.action_items || '';

        // Format key questions array as text (truncate to 2000 chars for Notion limit)
        const keyQuestionsText = Array.isArray(meetingData.key_questions) 
          ? meetingData.key_questions.join('\n• ') 
          : meetingData.key_questions || '';
        const truncatedKeyQuestions = keyQuestionsText.length > 2000 
          ? keyQuestionsText.substring(0, 1997) + '...' 
          : keyQuestionsText;

        // Format topics array as text (truncate to 2000 chars for Notion limit)
        const topicsText = Array.isArray(meetingData.topics) 
          ? meetingData.topics.join(', ') 
          : meetingData.topics || '';
        const truncatedTopics = topicsText.length > 2000 
          ? topicsText.substring(0, 1997) + '...' 
          : topicsText;

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
            },
            'Participants': {
              multi_select: Array.isArray(meetingData.participants) 
                ? meetingData.participants.map(p => ({ name: p }))
                : []
            },
            'Summary': {
              rich_text: [
                {
                  text: {
                    content: (meetingData.summary || '').substring(0, 2000)
                  }
                }
              ]
            },
            'Topics': {
              multi_select: Array.isArray(meetingData.topics) 
                ? meetingData.topics.map(t => ({ name: t }))
                : []
            },
            'Report URL': {
              url: meetingData.report_url || null
            },
            'Type': {
              select: meetingData.type ? { name: meetingData.type } : { name: 'Exec' }
            },
            'Date': {
              date: {
                start: meetingData.start_time || null
              }
            },
            'Comments': {
              rich_text: [
                {
                  text: {
                    content: meetingData.comments || ''
                  }
                }
              ]
            }
          }
        };

        const response = await fetch(`${this.apiBase}/pages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Notion-Version': this.apiVersion
          },
          body: JSON.stringify(pageData)
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Meeting page created successfully!');
          console.log('🆔 Page ID:', result.id);
          
          // Add transcript as page content
          if (meetingData.transcript) {
            await this.addTranscriptToPage(result.id, meetingData.transcript);
          }
          
          return result;
        } else {
          const error = await response.text();
          console.error(`❌ Failed to create meeting page (attempt ${attempt}):`, error);
          
          if (attempt === retries) {
            return null;
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      } catch (error) {
        console.error(`❌ Error creating meeting page (attempt ${attempt}):`, error.message);
        
        if (attempt === retries) {
          return null;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
    
    return null;
  }

  /**
   * Add transcript content to a page as condensed as possible
   */
  async addTranscriptToPage(pageId, transcript) {
    try {
      console.log('📄 Adding transcript to page...');
      console.log(`📄 Transcript length: ${transcript ? transcript.length : 'null'} characters`);
      
      if (!transcript || transcript.trim().length === 0) {
        console.log('⚠️ No transcript content to add');
        return true;
      }
      
      // Remove all line breaks and extra whitespace to make it as condensed as possible
      const condensedTranscript = transcript
        .replace(/\n/g, ' ')  // Replace line breaks with spaces
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .trim();
      
      console.log(`📄 Condensed transcript length: ${condensedTranscript.length} characters`);
      
      // Split transcript into chunks that fit Notion's 2000 character limit
      const maxChunkSize = 1900; // Leave some buffer under 2000
      const transcriptChunks = this.chunkText(condensedTranscript, maxChunkSize);
      
      console.log(`📄 Split into ${transcriptChunks.length} chunks`);
      
      // Create blocks for each chunk
      const transcriptBlocks = transcriptChunks.map((chunk, index) => ({
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

      // Process in batches to avoid API limits
      const batchSize = 50;
      for (let i = 0; i < transcriptBlocks.length; i += batchSize) {
        const batch = transcriptBlocks.slice(i, i + batchSize);
        
        const response = await fetch(`${this.apiBase}/blocks/${pageId}/children`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify({
            children: batch
          })
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(`❌ Failed to add transcript batch ${Math.floor(i/batchSize) + 1}:`, error);
          console.error(`❌ Response status: ${response.status} ${response.statusText}`);
          return false;
        }
        
        const result = await response.json();
        console.log(`✅ Added batch ${Math.floor(i/batchSize) + 1} (${batch.length} blocks)`);
        
        // Small delay between batches
        if (i + batchSize < transcriptBlocks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('✅ All transcript blocks added successfully!');
      return true;
    } catch (error) {
      console.error('❌ Error adding transcript:', error);
      return false;
    }
  }

  /**
   * Split text into chunks
   */
  chunkText(text, maxSize) {
    if (text.length <= maxSize) {
      return [text];
    }

    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + maxSize;
      
      // Try to break at a sentence or word boundary
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

  /**
   * Get all pages from the meeting database
   */
  async getMeetingPages() {
    try {
      const response = await fetch(`${this.apiBase}/databases/${this.meetingDatabaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        const result = await response.json();
        return result.results;
      } else {
        const error = await response.text();
        console.error('❌ Failed to get meeting pages:', error);
        return [];
      }
    } catch (error) {
      console.error('❌ Error getting meeting pages:', error);
      return [];
    }
  }
}

export default NotionClient;
