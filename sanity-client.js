import { createClient } from '@sanity/client';
import dotenv from 'dotenv';
import AVIFConverter from './avif-converter.js';

dotenv.config();

class SanityClient {
  constructor() {
    this.client = createClient({
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET,
      token: process.env.SANITY_TOKEN,
      useCdn: false, // Use the live API for mutations
      apiVersion: '2023-12-01',
    });
    this.avifConverter = new AVIFConverter();
  }

  /**
   * Get all existing team members from Sanity
   */
  async getExistingTeamMembers() {
    try {
      const query = `*[_type == "teamMember"] {
        _id,
        name,
        email,
        role,
        department,
        linkedin,
        image
      }`;
      
      const members = await this.client.fetch(query);
      console.log(`Found ${members.length} existing team members in Sanity`);
      return members;
    } catch (error) {
      console.error('Error fetching existing team members:', error);
      throw error;
    }
  }

  /**
   * Create a new team member in Sanity
   */
  async createTeamMember(memberData) {
    try {
      const doc = {
        _type: 'teamMember',
        name: memberData.name,
        role: memberData.position || '', // Map position to role field
        department: memberData.department || '',
        email: memberData.email || '',
        linkedin: memberData.linkedin || '',
      };

      // Add image if provided (from Slack profile) with AVIF conversion
      let avatarResult = null;
      if (memberData.profileImage) {
        avatarResult = await this.uploadTeamMemberAvatarWithAVIF(memberData.profileImage, memberData.name);
        if (avatarResult.success && avatarResult.assetId) {
          doc.image = {
            _type: 'image',
            asset: {
              _type: 'reference',
              _ref: avatarResult.assetId
            }
          };
        } else {
          console.warn(`⚠️ Could not upload avatar for ${memberData.name}, creating member without avatar`);
        }
      }

      const result = await this.client.create(doc);
      console.log(`✅ Created team member: ${memberData.name}`);
      return { ...result, avatarResult };
    } catch (error) {
      console.error(`❌ Error creating team member ${memberData.name}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing team member in Sanity
   */
  async updateTeamMember(sanityId, memberData) {
    try {
      const updateData = {
        name: memberData.name,
        role: memberData.position || '', // Map position to role field
        department: memberData.department || '',
        email: memberData.email || '',
        linkedin: memberData.linkedin || '',
      };

      // Handle image: add if provided, explicitly remove if null (default avatar)
      let avatarResult = null;
      if (memberData.profileImage) {
        // Add/update image from Slack profile with AVIF conversion
        avatarResult = await this.uploadTeamMemberAvatarWithAVIF(memberData.profileImage, memberData.name);
        if (avatarResult.success && avatarResult.assetId) {
          updateData.image = {
            _type: 'image',
            asset: {
              _type: 'reference',
              _ref: avatarResult.assetId
            }
          };
        } else {
          console.warn(`⚠️ Could not upload avatar for ${memberData.name}, updating member without avatar`);
        }
      } else {
        // Explicitly remove image field for default avatars
        updateData.image = null;
      }

      const result = await this.client
        .patch(sanityId)
        .set(updateData)
        .commit();

      console.log(`✅ Updated team member: ${memberData.name}`);
      return { ...result, avatarResult };
    } catch (error) {
      console.error(`❌ Error updating team member ${memberData.name}:`, error);
      throw error;
    }
  }

  /**
   * Delete a team member from Sanity
   */
  async deleteTeamMember(sanityId, memberName) {
    try {
      await this.client.delete(sanityId);
      console.log(`✅ Deleted team member: ${memberName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting team member ${memberName}:`, error);
      throw error;
    }
  }

  /**
   * Upload team member avatar with AVIF conversion
   * Returns object with success status and details
   */
  async uploadTeamMemberAvatarWithAVIF(avatarUrl, memberName) {
    try {
      if (!avatarUrl || !avatarUrl.startsWith('http')) {
        console.warn(`Invalid avatar URL for ${memberName}: ${avatarUrl}`);
        return {
          success: false,
          assetId: null,
          error: 'Invalid avatar URL',
          fallbackUsed: false
        };
      }

      console.log(`🖼️ Processing avatar for ${memberName} from: ${avatarUrl}`);

      // Convert avatar to AVIF format
      const avifBuffer = await this.avifConverter.convertUrlToAVIF(
        avatarUrl, 
        `${memberName.replace(/\s+/g, '-').toLowerCase()}-avatar`,
        {
          quality: 80, // Slightly lower quality for avatars vs logos
          effort: 5,    // Balanced effort for avatars
          lossless: false
        }
      );

      // Upload the AVIF image to Sanity
      const asset = await this.client.assets.upload('image', avifBuffer, {
        filename: `${memberName.replace(/\s+/g, '-').toLowerCase()}-avatar.avif`
      });

      console.log(`✅ Successfully uploaded AVIF avatar for ${memberName}: ${asset._id}`);
      return {
        success: true,
        assetId: asset._id,
        error: null,
        fallbackUsed: false
      };
    } catch (error) {
      console.error(`❌ AVIF conversion failed for ${memberName}:`, error.message);
      
      // Try fallback to original image
      try {
        console.log(`🔄 Attempting fallback to original image for ${memberName}...`);
        const fallbackAssetId = await this.uploadImageFromUrl(avatarUrl, `${memberName}-avatar`);
        
        if (fallbackAssetId) {
          console.log(`✅ Fallback successful for ${memberName}`);
          return {
            success: true,
            assetId: fallbackAssetId,
            error: null,
            fallbackUsed: true
          };
        } else {
          throw new Error('Fallback upload also failed');
        }
      } catch (fallbackError) {
        console.error(`❌ Both AVIF conversion and fallback failed for ${memberName}:`, fallbackError.message);
        return {
          success: false,
          assetId: null,
          error: `AVIF conversion failed: ${error.message}. Fallback failed: ${fallbackError.message}`,
          fallbackUsed: false
        };
      }
    }
  }

  /**
   * Upload image from URL to Sanity
   */
  async uploadImageFromUrl(imageUrl, memberName) {
    try {
      if (!imageUrl || !imageUrl.startsWith('http')) {
        console.warn(`Invalid image URL for ${memberName}: ${imageUrl}`);
        return null;
      }

      console.log(`🖼️ Attempting to fetch image for ${memberName} from: ${imageUrl}`);

      // Fetch the image with proper headers for Google Drive
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };

      const response = await fetch(imageUrl, { 
        headers,
        redirect: 'follow',
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        console.warn(`Could not fetch image for ${memberName}: ${response.status} ${response.statusText}`);
        return null;
      }

      const contentType = response.headers.get('content-type');
      // Accept image/* content types and application/octet-stream (common for Google Drive)
      if (!contentType || (!contentType.startsWith('image/') && contentType !== 'application/octet-stream')) {
        console.warn(`Invalid content type for ${memberName}: ${contentType}`);
        return null;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        console.warn(`Empty image data for ${memberName}`);
        return null;
      }

      // Determine file extension from content type
      let extension = 'jpg'; // default
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('gif')) extension = 'gif';
      else if (contentType.includes('webp')) extension = 'webp';
      else if (contentType.includes('svg')) extension = 'svg';
      else if (contentType === 'application/octet-stream') {
        // For Google Drive files, try to determine from URL or default to jpg
        extension = 'jpg';
      }

      const asset = await this.client.assets.upload('image', Buffer.from(buffer), {
        filename: `${memberName.replace(/\s+/g, '-').toLowerCase()}.${extension}`
      });

      console.log(`✅ Successfully uploaded image for ${memberName}: ${asset._id}`);
      return asset._id;
    } catch (error) {
      console.error(`Error uploading image for ${memberName}:`, error.message);
      return null;
    }
  }

  /**
   * Upload client logo with AVIF conversion
   * Returns object with success status and details
   */
  async uploadClientLogoWithAVIF(logoUrl, clientName) {
    try {
      if (!logoUrl || !logoUrl.startsWith('http')) {
        console.warn(`Invalid logo URL for ${clientName}: ${logoUrl}`);
        return {
          success: false,
          assetId: null,
          error: 'Invalid logo URL',
          fallbackUsed: false
        };
      }

      console.log(`🖼️ Processing logo for ${clientName} from: ${logoUrl}`);

      // Convert logo to AVIF format
      const avifBuffer = await this.avifConverter.convertUrlToAVIF(
        logoUrl, 
        `${clientName.replace(/\s+/g, '-').toLowerCase()}-logo`,
        {
          quality: 85, // Higher quality for logos
          effort: 6,    // Higher effort for better compression
          lossless: false
        }
      );

      // Upload the AVIF image to Sanity
      const asset = await this.client.assets.upload('image', avifBuffer, {
        filename: `${clientName.replace(/\s+/g, '-').toLowerCase()}-logo.avif`
      });

      console.log(`✅ Successfully uploaded AVIF logo for ${clientName}: ${asset._id}`);
      return {
        success: true,
        assetId: asset._id,
        error: null,
        fallbackUsed: false
      };
    } catch (error) {
      console.error(`❌ AVIF conversion failed for ${clientName}:`, error.message);
      
      // Try fallback to original image
      try {
        console.log(`🔄 Attempting fallback to original image for ${clientName}...`);
        const fallbackAssetId = await this.uploadImageFromUrl(logoUrl, `${clientName}-logo`);
        
        if (fallbackAssetId) {
          console.log(`✅ Fallback successful for ${clientName}`);
          return {
            success: true,
            assetId: fallbackAssetId,
            error: null,
            fallbackUsed: true
          };
        } else {
          throw new Error('Fallback upload also failed');
        }
      } catch (fallbackError) {
        console.error(`❌ Both AVIF conversion and fallback failed for ${clientName}:`, fallbackError.message);
        return {
          success: false,
          assetId: null,
          error: `AVIF conversion failed: ${error.message}. Fallback failed: ${fallbackError.message}`,
          fallbackUsed: false
        };
      }
    }
  }

  /**
   * Sync team members from Slack data
   */
  async syncTeamMembers(slackData) {
    try {
      const existingMembers = await this.getExistingTeamMembers();
      const results = {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: [],
        failedAvatars: []
      };

      // Create a map of existing members by email for easy lookup
      const existingByEmail = new Map();
      existingMembers.forEach(member => {
        if (member.email) {
          existingByEmail.set(member.email.toLowerCase(), member);
        }
      });

      // Process each member from Slack
      for (const memberData of slackData) {
        try {
          if (!memberData.email) {
            console.warn(`Skipping ${memberData.name} - no email provided`);
            continue;
          }

          const existingMember = existingByEmail.get(memberData.email.toLowerCase());
          
          if (existingMember) {
            // Update existing member
            const updateResult = await this.updateTeamMember(existingMember._id, memberData);
            
            // Check if avatar conversion failed
            if (updateResult.avatarResult && !updateResult.avatarResult.success) {
              console.warn(`⚠️ Avatar conversion failed for ${memberData.name}, excluding from sync`);
              results.failedAvatars.push({
                name: memberData.name,
                avatarUrl: memberData.profileImage,
                error: updateResult.avatarResult.error
              });
              continue; // Skip this member
            }
            
            results.updated++;
            existingByEmail.delete(memberData.email.toLowerCase());
          } else {
            // Create new member
            const createResult = await this.createTeamMember(memberData);
            
            // Check if avatar conversion failed
            if (createResult.avatarResult && !createResult.avatarResult.success) {
              console.warn(`⚠️ Avatar conversion failed for ${memberData.name}, excluding from sync`);
              results.failedAvatars.push({
                name: memberData.name,
                avatarUrl: memberData.profileImage,
                error: createResult.avatarResult.error
              });
              continue; // Skip this member
            }
            
            results.created++;
          }
        } catch (error) {
          console.error(`Error processing ${memberData.name}:`, error);
          results.errors.push({ name: memberData.name, error: error.message });
        }
      }

      // Delete members that are no longer in Slack
      for (const [email, member] of existingByEmail) {
        try {
          await this.deleteTeamMember(member._id, member.name);
          results.deleted++;
        } catch (error) {
          console.error(`Error deleting ${member.name}:`, error);
          results.errors.push({ name: member.name, error: error.message });
        }
      }

      console.log('📊 Sync Results:', results);
      return results;
    } catch (error) {
      console.error('Error syncing team members:', error);
      throw error;
    }
  }

  /**
   * Update alumni count in siteSettings
   */
  async updateAlumniCount(count) {
    try {
      // Get the siteSettings document
      const siteSettings = await this.client.fetch(`*[_type == "siteSettings"][0]`);
      
      if (siteSettings) {
        // Update existing siteSettings document
        await this.client
          .patch(siteSettings._id)
          .set({
            alumniCount: count
          })
          .commit();
        console.log(`✅ Updated alumni count in siteSettings: ${count}`);
      } else {
        console.error('❌ No siteSettings document found');
        throw new Error('No siteSettings document found');
      }
    } catch (error) {
      console.error('Error updating alumni count in siteSettings:', error);
      throw error;
    }
  }

  /**
   * Get all existing clients from Sanity
   */
  async getExistingClients() {
    try {
      const query = `*[_type == "client"] {
        _id,
        name,
        website,
        industry,
        logo,
        country,
        projectType,
        cycle
      }`;
      
      const clients = await this.client.fetch(query);
      console.log(`Found ${clients.length} existing clients in Sanity`);
      return clients;
    } catch (error) {
      console.error('Error fetching existing clients:', error);
      throw error;
    }
  }

  /**
   * Create a new client in Sanity
   */
  async createClient(clientData) {
    try {
      const doc = {
        _type: 'client',
        name: clientData.name,
        website: clientData.website,
        industry: clientData.industry,
        country: clientData.country || '',
        projectType: clientData.projectType || '',
        cycle: clientData.cycle || ''
      };

      // Add logo if provided (with AVIF conversion)
      let logoResult = null;
      if (clientData.logoUrl) {
        try {
          logoResult = await this.uploadClientLogoWithAVIF(clientData.logoUrl, clientData.name);
          if (logoResult.success && logoResult.assetId) {
            doc.logo = {
              _type: 'image',
              asset: {
                _type: 'reference',
                _ref: logoResult.assetId
              }
            };
          } else {
            console.warn(`⚠️ Could not upload logo for ${clientData.name}, creating client without logo`);
          }
        } catch (error) {
          console.warn(`⚠️ Logo upload failed for ${clientData.name}: ${error.message}, creating client without logo`);
        }
      }

      const result = await this.client.create(doc);
      console.log(`✅ Created client: ${clientData.name}`);
      return { ...result, logoResult };
    } catch (error) {
      console.error(`❌ Error creating client ${clientData.name}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing client in Sanity
   */
  async updateClient(sanityId, clientData) {
    try {
      const updateData = {
        name: clientData.name,
        website: clientData.website,
        industry: clientData.industry,
        country: clientData.country || '',
        projectType: clientData.projectType || '',
        cycle: clientData.cycle || ''
      };

      // Handle logo: add if provided (with AVIF conversion)
      let logoResult = null;
      if (clientData.logoUrl) {
        try {
          logoResult = await this.uploadClientLogoWithAVIF(clientData.logoUrl, clientData.name);
          if (logoResult.success && logoResult.assetId) {
            updateData.logo = {
              _type: 'image',
              asset: {
                _type: 'reference',
                _ref: logoResult.assetId
              }
            };
          } else {
            console.warn(`⚠️ Could not upload logo for ${clientData.name}, updating client without logo`);
          }
        } catch (error) {
          console.warn(`⚠️ Logo upload failed for ${clientData.name}: ${error.message}, updating client without logo`);
        }
      }

      const result = await this.client
        .patch(sanityId)
        .set(updateData)
        .commit();

      console.log(`✅ Updated client: ${clientData.name}`);
      return { ...result, logoResult };
    } catch (error) {
      console.error(`❌ Error updating client ${clientData.name}:`, error);
      throw error;
    }
  }

  /**
   * Delete a client from Sanity
   */
  async deleteClient(sanityId, clientName) {
    try {
      await this.client.delete(sanityId);
      console.log(`✅ Deleted client: ${clientName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting client ${clientName}:`, error);
      throw error;
    }
  }

  /**
   * Sync clients from Google Sheets data
   */
  async syncClients(sheetsData) {
    try {
      const existingClients = await this.getExistingClients();
      const results = {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: [],
        failedLogos: []
      };

      // Create a map of existing clients by name for easy lookup
      const existingByName = new Map();
      existingClients.forEach(client => {
        if (client.name) {
          existingByName.set(client.name.toLowerCase(), client);
        }
      });

      // Process each client from Google Sheets
      for (const clientData of sheetsData) {
        try {
          if (!clientData.name) {
            console.warn(`Skipping client - no name provided`);
            continue;
          }

          const existingClient = existingByName.get(clientData.name.toLowerCase());
          
          if (existingClient) {
            // Update existing client
            const updateResult = await this.updateClient(existingClient._id, clientData);
            
            // Check if logo conversion failed
            if (updateResult.logoResult && !updateResult.logoResult.success) {
              console.warn(`⚠️ Logo conversion failed for ${clientData.name}, excluding from sync`);
              results.failedLogos.push({
                name: clientData.name,
                logoUrl: clientData.logoUrl,
                error: updateResult.logoResult.error
              });
              continue; // Skip this client
            }
            
            results.updated++;
            existingByName.delete(clientData.name.toLowerCase());
          } else {
            // Create new client
            const createResult = await this.createClient(clientData);
            
            // Check if logo conversion failed
            if (createResult.logoResult && !createResult.logoResult.success) {
              console.warn(`⚠️ Logo conversion failed for ${clientData.name}, excluding from sync`);
              results.failedLogos.push({
                name: clientData.name,
                logoUrl: clientData.logoUrl,
                error: createResult.logoResult.error
              });
              continue; // Skip this client
            }
            
            results.created++;
          }
        } catch (error) {
          console.error(`Error processing ${clientData.name}:`, error);
          results.errors.push({ name: clientData.name, error: error.message });
        }
      }

      // Delete clients that are no longer in Google Sheets
      for (const [name, client] of existingByName) {
        try {
          await this.deleteClient(client._id, client.name);
          results.deleted++;
        } catch (error) {
          console.error(`Error deleting ${client.name}:`, error);
          results.errors.push({ name: client.name, error: error.message });
        }
      }

      console.log('📊 Client Sync Results:', results);
      return results;
    } catch (error) {
      console.error('Error syncing clients:', error);
      throw error;
    }
  }

  /**
   * Test the connection to Sanity
   */
  async testConnection() {
    try {
      const query = `*[_type == "teamMember"][0]`;
      await this.client.fetch(query);
      console.log('✅ Sanity connection successful');
      return true;
    } catch (error) {
      console.error('❌ Sanity connection failed:', error.message);
      return false;
    }
  }

  /**
   * Clean up resources (call this when done with the client)
   */
  cleanup() {
    if (this.avifConverter) {
      this.avifConverter.cleanup();
    }
  }
}

export default SanityClient;
