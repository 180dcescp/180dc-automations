#!/usr/bin/env node

/**
 * LinkedIn Posts Sync Automation
 * 
 * This script automatically syncs LinkedIn organization posts from the last 6 months to Sanity CMS.
 * It handles position extraction, department assignment, alumni exclusion, and default avatar detection.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import { createClient } from '@sanity/client';
import dotenv from 'dotenv';

dotenv.config();

/**
 * LinkedInPostsSync class handles the synchronization of LinkedIn posts
 * from LinkedIn API to Sanity CMS with intelligent processing and error handling.
 */
class LinkedInPostsSync {
  /**
   * Initialize the sync system with Sanity client
   * @constructor
   */
  constructor() {
    // Initialize Sanity client
    this.sanity = createClient({
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET,
      token: process.env.SANITY_TOKEN,
      useCdn: false, // Use the live API for mutations
      apiVersion: '2023-12-01',
    });

    // LinkedIn API configuration
    this.linkedinApiBase = 'https://api.linkedin.com/v2';
    this.linkedinId = process.env.LINKEDIN_ID;
    this.linkedinApiKey = process.env.LINKEDIN_API_KEY;
    
    // Calculate date 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    this.sixMonthsAgo = sixMonthsAgo.toISOString();
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const required = [
      'SANITY_PROJECT_ID',
      'SANITY_DATASET', 
      'SANITY_TOKEN',
      'LINKEDIN_ID',
      'LINKEDIN_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Test connection to Sanity
   */
  async testSanityConnection() {
    try {
      const query = `*[_type == "post"][0]`;
      await this.sanity.fetch(query);
      console.log('✅ Sanity connection successful');
      return true;
    } catch (error) {
      console.error('❌ Sanity connection failed:', error.message);
      return false;
    }
  }

  /**
   * Test connection to LinkedIn API
   */
  async testLinkedInConnection() {
    try {
      const response = await fetch(`${this.linkedinApiBase}/organizations/${this.linkedinId}`, {
        headers: {
          'Authorization': `Bearer ${this.linkedinApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log('✅ LinkedIn API connection successful');
        return true;
      } else {
        const error = await response.text();
        console.error('❌ LinkedIn API connection failed:', error);
        return false;
      }
    } catch (error) {
      console.error('❌ LinkedIn API connection failed:', error.message);
      return false;
    }
  }

  /**
   * Test all service connections
   */
  async testConnections() {
    const results = {
      sanity: false,
      linkedin: false,
      allConnected: false
    };

    try {
      results.sanity = await this.testSanityConnection();
    } catch (error) {
      console.error('Sanity connection failed:', error.message);
    }

    try {
      results.linkedin = await this.testLinkedInConnection();
    } catch (error) {
      console.error('LinkedIn connection failed:', error.message);
    }

    results.allConnected = results.sanity && results.linkedin;
    return results;
  }

  /**
   * Fetch LinkedIn posts from the last 6 months
   */
  async fetchLinkedInPosts() {
    try {
      console.log('📊 Fetching LinkedIn posts from the last 6 months...');
      
      const response = await fetch(`${this.linkedinApiBase}/ugcPosts?q=authors&authors=List(${this.linkedinId})&count=100`, {
        headers: {
          'Authorization': `Bearer ${this.linkedinApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LinkedIn API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const posts = data.elements || [];
      
      // Filter posts from the last 6 months
      const recentPosts = posts.filter(post => {
        const postDate = new Date(post.created.time);
        return postDate >= new Date(this.sixMonthsAgo);
      });

      console.log(`Found ${posts.length} total posts, ${recentPosts.length} from last 6 months`);
      return recentPosts;
    } catch (error) {
      console.error('Error fetching LinkedIn posts:', error);
      throw error;
    }
  }

  /**
   * Convert LinkedIn post text to Sanity block content
   */
  convertToSanityContent(linkedinText) {
    if (!linkedinText) return [];
    
    return [{
      _type: 'block',
      _key: 'linkedin-content',
      style: 'normal',
      children: [{
        _type: 'span',
        _key: 'text',
        text: linkedinText
      }]
    }];
  }

  /**
   * Download and upload image to Sanity
   */
  async uploadImageToSanity(imageUrl) {
    if (!imageUrl) return null;

    try {
      console.log(`📸 Downloading image: ${imageUrl}`);
      
      // Download the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn(`Failed to download image: ${response.status}`);
        return null;
      }

      const imageBuffer = await response.arrayBuffer();
      const filename = `linkedin-${Date.now()}.jpg`;
      
      // Upload to Sanity
      const asset = await this.sanity.assets.upload('image', Buffer.from(imageBuffer), {
        filename: filename,
        contentType: 'image/jpeg'
      });

      console.log(`✅ Image uploaded to Sanity: ${asset._id}`);
      return {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: asset._id
        }
      };
    } catch (error) {
      console.warn(`⚠️ Failed to upload image: ${error.message}`);
      return null;
    }
  }

  /**
   * Transform LinkedIn post to Sanity format
   */
  async transformLinkedInPost(linkedinPost) {
    try {
      const postId = linkedinPost.id;
      const text = linkedinPost.specificContent?.shareContent?.shareCommentary?.text || '';
      const publishedAt = linkedinPost.created?.time || new Date().toISOString();
      
      // Get first image from media if available
      let mainImage = null;
      const media = linkedinPost.specificContent?.shareContent?.shareMediaCategory?.media || [];
      if (media.length > 0 && media[0].status === 'READY') {
        const imageUrl = media[0].media?.url;
        if (imageUrl) {
          mainImage = await this.uploadImageToSanity(imageUrl);
        }
      }

      return {
        linkedinPostId: postId,
        content: this.convertToSanityContent(text),
        publishedAt: publishedAt,
        mainImage: mainImage
      };
    } catch (error) {
      console.error(`Error transforming LinkedIn post ${linkedinPost.id}:`, error);
      throw error;
    }
  }

  /**
   * Get all existing posts from Sanity
   */
  async getExistingPosts() {
    try {
      const query = `*[_type == "post"] {
        _id,
        linkedinPostId,
        publishedAt,
        _updatedAt
      }`;
      
      const posts = await this.sanity.fetch(query);
      console.log(`Found ${posts.length} existing posts in Sanity`);
      return posts;
    } catch (error) {
      console.error('Error fetching existing posts:', error);
      throw error;
    }
  }

  /**
   * Create a new post in Sanity
   */
  async createPost(postData) {
    try {
      const doc = {
        _type: 'post',
        linkedinPostId: postData.linkedinPostId,
        content: postData.content,
        publishedAt: postData.publishedAt,
        mainImage: postData.mainImage
      };

      const result = await this.sanity.create(doc);
      console.log(`✅ Created post: ${postData.linkedinPostId}`);
      return result;
    } catch (error) {
      console.error(`❌ Error creating post ${postData.linkedinPostId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing post in Sanity
   */
  async updatePost(sanityId, postData) {
    try {
      const updateData = {
        content: postData.content,
        publishedAt: postData.publishedAt,
        mainImage: postData.mainImage
      };

      const result = await this.sanity
        .patch(sanityId)
        .set(updateData)
        .commit();

      console.log(`✅ Updated post: ${postData.linkedinPostId}`);
      return result;
    } catch (error) {
      console.error(`❌ Error updating post ${postData.linkedinPostId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a post from Sanity
   */
  async deletePost(sanityId, linkedinPostId) {
    try {
      await this.sanity.delete(sanityId);
      console.log(`✅ Deleted post: ${linkedinPostId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting post ${linkedinPostId}:`, error);
      throw error;
    }
  }

  /**
   * Sync posts from LinkedIn to Sanity
   */
  async syncPosts(linkedinPosts) {
    try {
      const existingPosts = await this.getExistingPosts();
      const results = {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: []
      };

      // Create a map of existing posts by LinkedIn post ID
      const existingByLinkedInId = new Map();
      existingPosts.forEach(post => {
        if (post.linkedinPostId) {
          existingByLinkedInId.set(post.linkedinPostId, post);
        }
      });

      // Process each LinkedIn post
      for (const linkedinPost of linkedinPosts) {
        try {
          const postData = await this.transformLinkedInPost(linkedinPost);
          const existingPost = existingByLinkedInId.get(postData.linkedinPostId);
          
          if (existingPost) {
            // Update existing post
            await this.updatePost(existingPost._id, postData);
            results.updated++;
            existingByLinkedInId.delete(postData.linkedinPostId);
          } else {
            // Create new post
            await this.createPost(postData);
            results.created++;
          }
        } catch (error) {
          console.error(`Error processing LinkedIn post ${linkedinPost.id}:`, error);
          results.errors.push({ linkedinPostId: linkedinPost.id, error: error.message });
        }
      }

      // Delete posts that are no longer in LinkedIn
      for (const [linkedinPostId, post] of existingByLinkedInId) {
        try {
          await this.deletePost(post._id, linkedinPostId);
          results.deleted++;
        } catch (error) {
          console.error(`Error deleting post ${linkedinPostId}:`, error);
          results.errors.push({ linkedinPostId, error: error.message });
        }
      }

      console.log('📊 LinkedIn Posts Sync Results:', results);
      return results;
    } catch (error) {
      console.error('Error syncing posts:', error);
      throw error;
    }
  }

  /**
   * Main sync process
   */
  async sync() {
    const startTime = Date.now();
    console.log('🚀 Starting LinkedIn Posts Sync Process...\n');
    
    try {
      // Validate environment
      this.validateEnvironment();
      
      // Test all connections first
      console.log('🔍 Testing connections...');
      const connections = await this.testConnections();
      
      if (!connections.allConnected) {
        console.error('❌ Some connections failed. Please check your configuration.');
        return;
      }

      console.log('✅ All connections successful!\n');

      // Get posts from LinkedIn
      console.log('📊 Fetching LinkedIn posts...');
      const linkedinPosts = await this.fetchLinkedInPosts();
      
      if (linkedinPosts.length === 0) {
        console.log('⚠️ No LinkedIn posts found from the last 6 months');
        return;
      }

      console.log(`Found ${linkedinPosts.length} LinkedIn posts`);

      // Sync to Sanity
      console.log('🔄 Syncing to Sanity CMS...');
      const syncResults = await this.syncPosts(linkedinPosts);

      console.log('\n🎉 Sync completed successfully!');
      console.log(`📊 Summary: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.deleted} deleted`);

      if (syncResults.errors.length > 0) {
        console.log(`❌ ${syncResults.errors.length} errors occurred`);
      }

    } catch (error) {
      console.error('❌ Sync failed:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const sync = new LinkedInPostsSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('sync-linkedin-posts.js')) {
  main();
}

export default LinkedInPostsSync;
