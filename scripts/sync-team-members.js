#!/usr/bin/env node

/**
 * Team Member Sync Automation
 * 
 * This script automatically syncs team member data from Slack profiles to Sanity CMS.
 * It handles position extraction, department assignment, alumni exclusion, and default avatar detection.
 * Uses a delete-all-then-recreate approach for reliable data consistency.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.1.0
 * @since 2024-01-01
 */

import { createClient } from '@sanity/client';
import { WebClient } from '@slack/web-api';
import sharp from 'sharp';
import dotenv from 'dotenv';
import AVIFConverter from '../tools/avif-converter.js';

dotenv.config();

/**
 * TeamMemberSync class handles the synchronization of team member data
 * from Slack to Sanity CMS with intelligent processing and error handling.
 */
class TeamMemberSync {
  /**
   * Initialize the sync system with Sanity and Slack clients
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

    // Initialize Slack client
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.slackChannel = process.env.SLACK_CHANNEL || '#automation-updates';
    this.slackEnabled = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL);
    
    // Initialize AVIF converter
    this.avifConverter = new AVIFConverter();
    
    // Valid positions and departments from Sanity schema
    this.validPositions = [
      'President',
      'Vice-President', 
      'Head of',
      'Associate Director',
      'Project Leader',
      'Senior Consultant',
      'Consultant'
    ];
    
    this.validDepartments = [
      'Presidency',
      'Business Development',
      'P&O',
      'Marketing', 
      'Finance',
      'Events',
      'Consulting',
      'Consultants'
    ];
  }

  /**
   * Parse Slack profile title to extract position and department
   */
  parseTitle(title) {
    console.log(`🔍 DEBUG: Parsing title: "${title}"`);
    
    if (!title || typeof title !== 'string') {
      console.log(`🔍 DEBUG: Invalid title, returning empty`);
      return { position: '', department: '', isAlumni: false };
    }

    // Check if this is an alumni member
    if (title.toLowerCase().includes('alumni')) {
      console.log(`🔍 DEBUG: Alumni detected, returning empty`);
      return { position: '', department: '', isAlumni: true };
    }

    // Remove everything in parentheses (project names, etc.)
    let cleanTitle = title.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    console.log(`🔍 DEBUG: Cleaned title: "${cleanTitle}"`);
    
    // Split by " - " to separate position and department
    const parts = cleanTitle.split(' - ').map(p => p.trim());
    console.log(`🔍 DEBUG: Split parts:`, parts);
    
    if (parts.length >= 2) {
      const position = parts[0];
      const department = parts[1];
      console.log(`🔍 DEBUG: Position: "${position}", Department: "${department}"`);
      
      // Special case: President and Vice-President always get "Presidency"
      if (position === 'President' || position === 'Vice-President') {
        console.log(`🔍 DEBUG: President/Vice-President detected, setting department to Presidency`);
        return {
          position: position,
          department: 'Presidency',
          isAlumni: false
        };
      }
      
      // Special case: Consultant roles always get "Consultants"
      if (position === 'Consultant' || position === 'Senior Consultant' || position === 'Project Leader') {
        console.log(`🔍 DEBUG: Consultant role detected, setting role and department to Consultants`);
        return {
          position: 'Consultants',  // Changed from position to 'Consultants'
          department: 'Consultants',
          isAlumni: false
        };
      }
      
      console.log(`🔍 DEBUG: Using parsed position and department`);
      return {
        position: position,
        department: department,
        isAlumni: false
      };
    } else if (parts.length === 1) {
      const position = parts[0];
      console.log(`🔍 DEBUG: Single part position: "${position}"`);
      
      // Handle positions without explicit department
      if (position === 'President' || position === 'Vice-President') {
        console.log(`🔍 DEBUG: President/Vice-President without department, setting to Presidency`);
        return {
          position: position,
          department: 'Presidency',
          isAlumni: false
        };
      }
      
      if (position === 'Consultant' || position === 'Senior Consultant' || position === 'Project Leader') {
        console.log(`🔍 DEBUG: Consultant role without department, setting role and department to Consultants`);
        return {
          position: 'Consultants',  // Changed from position to 'Consultants'
          department: 'Consultants',
          isAlumni: false
        };
      }
      
      console.log(`🔍 DEBUG: Position without explicit department, defaulting to Consultants`);
      return {
        position: position,
        department: 'Consultants',  // Default to Consultants instead of empty
        isAlumni: false
      };
    }
    
    console.log(`🔍 DEBUG: No valid parts found, returning empty`);
    return { position: '', department: '', isAlumni: false };
  }

  /**
   * Analyze image colors to detect if one color covers more than 80% of the image
   */
  async analyzeImageColors(imageUrl) {
    try {
      // Download the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.log(`Failed to fetch image: ${response.status}`);
        return { isDefault: true, dominantColor: null, coverage: 0 };
      }

      const imageBuffer = await response.arrayBuffer();
      
      // Process image with sharp to get pixel data
      const { data, info } = await sharp(Buffer.from(imageBuffer))
        .resize(50, 50) // Resize to small size for faster processing
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Sample 100 random pixels for color analysis
      const sampleSize = 100;
      const totalPixels = info.width * info.height;
      const colorCounts = new Map();
      const pixelCounts = new Map();
      
      // Sample random pixels
      for (let i = 0; i < sampleSize; i++) {
        const randomIndex = Math.floor(Math.random() * totalPixels) * 3;
        const r = data[randomIndex];
        const g = data[randomIndex + 1];
        const b = data[randomIndex + 2];
        const colorKey = `${r},${g},${b}`;
        
        colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
        pixelCounts.set(colorKey, (pixelCounts.get(colorKey) || 0) + 1);
      }

      // Find the most dominant color from our sample
      let maxCount = 0;
      let dominantColor = null;
      
      for (const [color, count] of colorCounts) {
        if (count > maxCount) {
          maxCount = count;
          dominantColor = color;
        }
      }

      const coverage = (maxCount / sampleSize) * 100;
      const totalColors = colorCounts.size;
      
      // Detection logic: If one color covers more than 70% of the random sample, it's likely a default avatar
      const isDefault = coverage > 70;
      
      console.log(`Image analysis: ${coverage.toFixed(1)}% coverage by color ${dominantColor} from ${sampleSize} random pixels, isDefault: ${isDefault}`);
      
      return {
        isDefault,
        dominantColor,
        coverage,
        totalColors
      };
    } catch (error) {
      console.log(`Error analyzing image colors: ${error.message}`);
      return { isDefault: true, dominantColor: null, coverage: 0, totalColors: 0 };
    }
  }

  /**
   * Check if a Slack profile image is a default avatar
   */
  async isDefaultSlackAvatar(imageUrl, memberName = 'Unknown') {
    if (!imageUrl) {
      console.log(`🔍 ${memberName}: No profile image - DEFAULT`);
      return { isDefault: true, method: 'no-image' };
    }
    
    // First, check for obvious URL patterns (fast check)
    const urlPatterns = [
      // Slack default avatars
      'a.slack-edge.com/df10d/img/avatars/ava_',
      'a.slack-edge.com/df10d/img/avatars/avatar-',
      'a.slack-edge.com/df10d/img/avatars/default',
      'ca.slack-edge.com/',
      'slack.com/avatars/default',
      'slack.com/avatars/gravatar',
      'slack.com/avatars/identicon',
      'slack.com/avatars/initials',
      'slack.com/avatars/avatar-',
      
      // Gravatar default patterns
      'gravatar.com/avatar/00000000000000000000000000000000',
      'gravatar.com/avatar/d41d8cd98f00b204e9800998ecf8427e',
      'gravatar.com/avatar/00000000000000000000000000000000?d=identicon',
      'gravatar.com/avatar/00000000000000000000000000000000?d=mm',
      'gravatar.com/avatar/00000000000000000000000000000000?d=retro',
      'gravatar.com/avatar/00000000000000000000000000000000?d=wavatar',
      'gravatar.com/avatar/00000000000000000000000000000000?d=monsterid',
      'gravatar.com/avatar/00000000000000000000000000000000?d=robohash',
      
      // Generic default avatar patterns
      'default-avatar',
      'default_avatar',
      'default-',
      'avatar-default',
      'placeholder-avatar',
      'no-avatar',
      'no_avatar'
    ];
    
    // Check for exact matches and partial matches
    const isUrlDefault = urlPatterns.some(pattern => {
      return imageUrl.toLowerCase().includes(pattern.toLowerCase());
    });
    
    if (isUrlDefault) {
      console.log(`🔍 ${memberName}: URL pattern match - DEFAULT`);
      return { isDefault: true, method: 'url-pattern' };
    }
    
    // If URL patterns don't indicate a default, analyze the image colors
    try {
      const colorAnalysis = await this.analyzeImageColors(imageUrl);
      const method = colorAnalysis.isDefault ? 'color-analysis' : 'real-avatar';
      
      const methodText = colorAnalysis.isDefault ? 
        `Color analysis (${colorAnalysis.coverage.toFixed(1)}% coverage from 100 random pixels) - DEFAULT` : 
        `Color analysis (${colorAnalysis.coverage.toFixed(1)}% coverage from 100 random pixels) - REAL`;
      console.log(`🔍 ${memberName}: ${methodText}`);
      
      return { 
        isDefault: colorAnalysis.isDefault, 
        method: method, 
        coverage: colorAnalysis.coverage,
        totalColors: colorAnalysis.totalColors
      };
    } catch (error) {
      console.log(`🔍 ${memberName}: Color analysis failed - treating as REAL`);
      return { isDefault: false, method: 'analysis-failed' };
    }
  }

  /**
   * Upload profile image to Sanity with AVIF conversion
   */
  async uploadProfileImageToSanity(imageUrl, memberName) {
    console.log(`🔍 DEBUG: uploadProfileImageToSanity called for ${memberName} with URL: ${imageUrl}`);
    
    if (!imageUrl) {
      console.log(`🔍 DEBUG: No image URL provided for ${memberName}`);
      return null;
    }
    
    try {
      console.log(`📸 Processing profile image for ${memberName}...`);
      console.log(`🔍 DEBUG: Starting AVIF conversion for ${memberName}`);
      
      // Convert to AVIF using the converter
      const avifBuffer = await this.avifConverter.convertUrlToAVIF(
        imageUrl, 
        `${memberName.replace(/[^a-zA-Z0-9]/g, '_')}_profile`,
        { quality: 85, effort: 4 }
      );
      
      console.log(`🔍 DEBUG: AVIF conversion completed for ${memberName}, buffer size: ${avifBuffer.length} bytes`);
      
      // Upload to Sanity
      console.log(`🔍 DEBUG: Uploading to Sanity for ${memberName}`);
      const asset = await this.sanity.assets.upload('image', avifBuffer, {
        filename: `${memberName.replace(/[^a-zA-Z0-9]/g, '_')}_profile.avif`,
        contentType: 'image/avif'
      });
      
      console.log(`✅ Profile image uploaded for ${memberName}: ${asset._id}`);
      console.log(`🔍 DEBUG: Asset details:`, JSON.stringify(asset, null, 2));
      
      const result = {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: asset._id
        }
      };
      
      console.log(`🔍 DEBUG: Returning image reference:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error(`❌ Failed to upload profile image for ${memberName}:`, error.message);
      console.error(`🔍 DEBUG: Full error:`, error);
      return null;
    }
  }

  /**
   * Validate if position and department match the allowed values in Sanity schema
   */
  isValidPositionAndDepartment(position, department) {
    const isValidPosition = this.validPositions.includes(position);
    const isValidDepartment = this.validDepartments.includes(department);
    
    return {
      isValid: isValidPosition && isValidDepartment,
      isValidPosition,
      isValidDepartment,
      validPositions: this.validPositions,
      validDepartments: this.validDepartments
    };
  }

  /**
   * Get alumni count from Slack
   */
  async getAlumniCount() {
    try {
      const result = await this.slack.users.list({
        include_locale: true
      });

      if (!result.members) {
        return 0;
      }

      // Filter out bots and deleted users
      const activeMembers = result.members.filter(member => 
        !member.deleted && 
        !member.is_bot && 
        !member.is_app_user &&
        member.profile &&
        member.profile.email
      );

      // Count alumni members
      const alumniCount = activeMembers.filter(member => {
        const profile = member.profile;
        const { isAlumni } = this.parseTitle(profile.title);
        return isAlumni;
      }).length;

      console.log(`📊 Found ${alumniCount} alumni members in Slack`);
      return alumniCount;
    } catch (error) {
      console.error('Error fetching alumni count from Slack:', error);
      throw error;
    }
  }

  /**
   * Get all team members from Slack workspace
   */
  async getTeamMembers() {
    try {
      const result = await this.slack.users.list({
        include_locale: true
      });

      if (!result.members) {
        console.log('No members found in Slack workspace');
        return [];
      }

      // Filter out bots and deleted users
      const activeMembers = result.members.filter(member => 
        !member.deleted && 
        !member.is_bot && 
        !member.is_app_user &&
        member.profile &&
        member.profile.email
      );

      console.log(`Found ${activeMembers.length} active team members in Slack`);

      // Transform Slack members to our team member format
      const allMembers = await Promise.all(activeMembers.map(async member => {
        const profile = member.profile;
        console.log(`🔍 DEBUG: Processing member: ${profile.real_name || profile.display_name || member.name}`);
        console.log(`🔍 DEBUG: Raw profile title: "${profile.title}"`);
        
        const { position, department, isAlumni } = this.parseTitle(profile.title);
        console.log(`🔍 DEBUG: Parsed result - Position: "${position}", Department: "${department}", isAlumni: ${isAlumni}`);
        
        // Get the best available profile image
        const profileImage = profile.image_512 || profile.image_192 || profile.image_72;
        console.log(`🔍 DEBUG: Profile image URL: ${profileImage}`);
        
        // Check if it's a default avatar (now async)
        const avatarResult = await this.isDefaultSlackAvatar(profileImage, profile.real_name || profile.display_name || member.name);
        
        const memberData = {
          name: profile.real_name || profile.display_name || member.name,
          email: profile.email,
          position: position,
          department: department,
          profileImage: avatarResult.isDefault ? null : profileImage, // Set to null if default avatar
          slackId: member.id,
          slackUsername: member.name,
          isAlumni: isAlumni,
          isDefaultAvatar: avatarResult.isDefault,
          avatarMethod: avatarResult.method,
          avatarCoverage: avatarResult.coverage
        };
        
        console.log(`🔍 DEBUG: Final member data:`, JSON.stringify(memberData, null, 2));
        return memberData;
      }));

      // Filter out alumni members and log them
      const alumniMembers = allMembers.filter(member => member.isAlumni);
      if (alumniMembers.length > 0) {
        console.log(`📋 Found ${alumniMembers.length} alumni members (will be excluded):`);
        alumniMembers.forEach(member => {
          console.log(`  - ${member.name} (${member.slackUsername})`);
        });
      }

      // Log members with default avatars
      const defaultAvatarMembers = allMembers.filter(member => member.isDefaultAvatar && !member.isAlumni);
      if (defaultAvatarMembers.length > 0) {
        console.log(`🖼️ Found ${defaultAvatarMembers.length} members with default Slack avatars (will use Sanity default):`);
        defaultAvatarMembers.forEach(member => {
          console.log(`  - ${member.name} (${member.slackUsername})`);
        });
      }

      // Filter out members with invalid positions/departments and log them
      const invalidMembers = allMembers.filter(member => {
        if (member.isAlumni || !member.name || !member.email) return false;
        
        const validation = this.isValidPositionAndDepartment(member.position, member.department);
        return !validation.isValid;
      });

      if (invalidMembers.length > 0) {
        console.log(`⚠️ Found ${invalidMembers.length} members with invalid positions/departments (will be excluded):`);
        invalidMembers.forEach(member => {
          const validation = this.isValidPositionAndDepartment(member.position, member.department);
          console.log(`  - ${member.name} (${member.slackUsername})`);
          console.log(`    Position: "${member.position}" ${validation.isValidPosition ? '✅' : '❌'}`);
          console.log(`    Department: "${member.department}" ${validation.isValidDepartment ? '✅' : '❌'}`);
        });
      }

      const teamMembers = allMembers.filter(member => {
        if (!member.name || !member.email || member.isAlumni) return false;
        
        const validation = this.isValidPositionAndDepartment(member.position, member.department);
        return validation.isValid;
      }); // Only include members with valid positions and departments

      console.log(`\nProcessed ${teamMembers.length} active team members with complete data`);
      return teamMembers;
    } catch (error) {
      console.error('Error fetching team members from Slack:', error);
      throw error;
    }
  }

  /**
   * Test connection to Sanity
   */
  async testSanityConnection() {
    try {
      const query = `*[_type == "teamMember"][0]`;
      await this.sanity.fetch(query);
      console.log('✅ Sanity connection successful');
      return true;
    } catch (error) {
      console.error('❌ Sanity connection failed:', error.message);
      return false;
    }
  }

  /**
   * Test connection to Slack
   */
  async testSlackConnection() {
    try {
      const result = await this.slack.auth.test();
      console.log('✅ Slack connection successful');
      console.log(`Bot: ${result.user}`);
      console.log(`Team: ${result.team}`);
      return true;
    } catch (error) {
      console.error('❌ Slack connection failed:', error.message);
      return false;
    }
  }

  /**
   * Main sync process that orchestrates the entire team member synchronization.
   * Uses a delete-all-then-recreate approach for reliable data consistency.
   * @async
   * @function sync
   * @returns {Promise<void>} Resolves when sync is complete
   */
  async sync() {
    const startTime = Date.now();
    console.log('🚀 Starting Team Member Sync Process...\n');
    
    try {
      // Test all connections first
      console.log('🔍 Testing connections...');
      const connections = await this.testConnections();
      
      if (!connections.allConnected) {
        console.error('❌ Some connections failed. Please check your configuration.');
        await this.notifyAutomationFailure({
          script: 'Team Member Sync',
          error: new Error('Connection test failed'),
          context: 'Some services are not accessible'
        });
        return;
      }

      console.log('✅ All connections successful!\n');

      // Get data from Slack
      console.log('📊 Fetching team member data from Slack...');
      const slackData = await this.getTeamMembers();
      
      if (slackData.length === 0) {
        console.log('⚠️ No team members found in Slack');
        await this.notifyAutomationSuccess({
          script: 'Team Member Sync',
          summary: 'No team members found in Slack',
          results: { processed: 0, created: 0, updated: 0, deleted: 0 },
          duration: Date.now() - startTime
        });
        return;
      }

      console.log(`Found ${slackData.length} team members in Slack`);

      // Sync to Sanity
      console.log('🔄 Syncing to Sanity CMS...');
      const syncResults = await this.syncTeamMembers(slackData);

      // Update alumni count
      console.log('📊 Updating alumni count...');
      const alumniCount = await this.getAlumniCount();
      await this.updateAlumniCount(alumniCount);

      console.log('\n🎉 Sync completed successfully!');
      console.log(`📊 Summary: ${syncResults.created} created, ${syncResults.deleted} deleted`);
      console.log(`👥 Alumni count: ${alumniCount}`);

      if (syncResults.errors.length > 0) {
        console.log(`❌ ${syncResults.errors.length} errors occurred`);
      }

      // Handle failed avatar conversions
      if (syncResults.failedAvatars && syncResults.failedAvatars.length > 0) {
        console.log(`\n⚠️ ${syncResults.failedAvatars.length} team members excluded due to avatar conversion failures:`);
        syncResults.failedAvatars.forEach(failedAvatar => {
          console.log(`  - ${failedAvatar.name}: ${failedAvatar.error}`);
        });

        // Send Slack notification for failed avatars
        await this.notifyFailedAvatars(syncResults.failedAvatars);
      }

      // Send success notification
      await this.notifyAutomationSuccess({
        script: 'Team Member Sync',
        summary: `Synced ${slackData.length} team members from Slack to Sanity CMS. Alumni count: ${alumniCount}`,
        results: {
          created: syncResults.created,
          deleted: syncResults.deleted,
          processed: slackData.length,
          errors: syncResults.errors.length
        },
        duration: Date.now() - startTime
      });

    } catch (error) {
      console.error('❌ Sync failed:', error);
      
      // Send failure notification
      await this.notifyAutomationFailure({
        script: 'Team Member Sync',
        error: error,
        context: 'Team member synchronization failed'
      });
      
      throw error;
    }
  }

  /**
   * Test all service connections
   */
  async testConnections() {
    const results = {
      sanity: false,
      slack: false,
      allConnected: false
    };

    try {
      results.sanity = await this.testSanityConnection();
    } catch (error) {
      console.error('Sanity connection failed:', error.message);
    }

    try {
      results.slack = await this.testSlackConnection();
    } catch (error) {
      console.error('Slack connection failed:', error.message);
    }

    results.allConnected = results.sanity && results.slack;
    return results;
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
        image,
        slackId,
        slackUsername
      }`;
      
      const members = await this.sanity.fetch(query);
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
      console.log(`🔍 DEBUG: Creating team member for ${memberData.name}`);
      console.log(`🔍 DEBUG: Raw memberData:`, JSON.stringify(memberData, null, 2));
      
      const doc = {
        _type: 'teamMember',
        name: memberData.name,
        email: memberData.email,
        role: memberData.position,        // Changed from 'position' to 'role'
        department: memberData.department,
        slackId: memberData.slackId,
        slackUsername: memberData.slackUsername
      };

      console.log(`🔍 DEBUG: Document before image processing:`, JSON.stringify(doc, null, 2));

      // Add profile image if provided (not a default avatar)
      if (memberData.profileImage) {
        console.log(`🔍 DEBUG: Processing profile image for ${memberData.name}: ${memberData.profileImage}`);
        const uploadedImage = await this.uploadProfileImageToSanity(
          memberData.profileImage, 
          memberData.name
        );
        
        if (uploadedImage) {
          doc.image = uploadedImage;  // Changed from 'photo' to 'image' to match Sanity schema
          console.log(`🔍 DEBUG: Image uploaded successfully for ${memberData.name}`);
        } else {
          console.log(`🔍 DEBUG: Image upload failed for ${memberData.name}`);
        }
      } else {
        console.log(`🔍 DEBUG: No profile image for ${memberData.name} (default avatar or no image)`);
      }

      console.log(`🔍 DEBUG: Final document to create:`, JSON.stringify(doc, null, 2));

      const result = await this.sanity.create(doc);
      console.log(`✅ Created team member: ${memberData.name}`);
      console.log(`🔍 DEBUG: Sanity response:`, JSON.stringify(result, null, 2));
      
      // Compare sent vs received fields
      console.log(`🔍 DEBUG: Field comparison for ${memberData.name}:`);
      console.log(`  - Sent role: "${doc.role}" | Received role: "${result.role || 'MISSING'}"`);
      console.log(`  - Sent department: "${doc.department}" | Received department: "${result.department || 'MISSING'}"`);
      console.log(`  - Sent image: ${doc.image ? 'YES' : 'NO'} | Received image: ${result.image ? 'YES' : 'NO'}`);
      
      return result;
    } catch (error) {
      console.error(`❌ Error creating team member ${memberData.name}:`, error);
      console.error(`🔍 DEBUG: Error details:`, error.message);
      console.error(`🔍 DEBUG: Error stack:`, error.stack);
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
        email: memberData.email,
        role: memberData.position,        // Changed from 'position' to 'role'
        department: memberData.department,
        slackId: memberData.slackId,
        slackUsername: memberData.slackUsername
      };

      // Handle profile image: add if provided
      if (memberData.profileImage) {
        const uploadedImage = await this.uploadProfileImageToSanity(
          memberData.profileImage, 
          memberData.name
        );
        
        if (uploadedImage) {
          updateData.image = uploadedImage;  // Changed from 'photo' to 'image' to match Sanity schema
        }
      }

      const result = await this.sanity
        .patch(sanityId)
        .set(updateData)
        .commit();

      console.log(`✅ Updated team member: ${memberData.name}`);
      return result;
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
      await this.sanity.delete(sanityId);
      console.log(`✅ Deleted team member: ${memberName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting team member ${memberName}:`, error);
      throw error;
    }
  }

  /**
   * Sync team members from Slack data using delete-all-then-recreate approach
   */
  async syncTeamMembers(slackData) {
    try {
      const results = {
        created: 0,
        deleted: 0,
        errors: [],
        failedAvatars: []
      };

      // Step 1: Delete all existing team members
      console.log('🗑️ Deleting all existing team members...');
      const existingMembers = await this.getExistingTeamMembers();
      
      for (const member of existingMembers) {
        try {
          await this.deleteTeamMember(member._id, member.name);
          results.deleted++;
        } catch (error) {
          console.error(`Error deleting ${member.name}:`, error);
          results.errors.push({ name: member.name, error: error.message });
        }
      }

      console.log(`✅ Deleted ${results.deleted} existing team members`);

      // Step 2: Create all members from Slack data
      console.log('➕ Creating all team members from Slack data...');
      for (const memberData of slackData) {
        try {
          console.log(`🔍 DEBUG: Validating member: ${memberData.name}`);
          console.log(`🔍 DEBUG: Member data for validation:`, JSON.stringify(memberData, null, 2));
          
          // Validate required fields
          if (!memberData.name || !memberData.email) {
            console.warn(`⚠️ Skipping member - no name or email provided`);
            console.log(`🔍 DEBUG: Name: "${memberData.name}", Email: "${memberData.email}"`);
            continue;
          }
          
          // Validate position and department are not empty
          if (!memberData.position || !memberData.department) {
            console.warn(`⚠️ Skipping ${memberData.name} - missing position or department`);
            console.log(`🔍 DEBUG: Position: "${memberData.position}", Department: "${memberData.department}"`);
            results.errors.push({ 
              name: memberData.name, 
              error: `Missing position (${memberData.position}) or department (${memberData.department})`
            });
            continue;
          }

          console.log(`🔍 DEBUG: Validation passed for ${memberData.name}, proceeding to create`);
          await this.createTeamMember(memberData);
          results.created++;
        } catch (error) {
          console.error(`Error creating ${memberData.name}:`, error);
          results.errors.push({ name: memberData.name, error: error.message });
        }
      }

      console.log(`✅ Created ${results.created} new team members`);
      console.log('📊 Team Member Sync Results:', results);
      return results;
    } catch (error) {
      console.error('Error syncing team members:', error);
      throw error;
    }
  }

  /**
   * Update alumni count in site settings
   */
  async updateAlumniCount(count) {
    try {
      // First, try to find existing site settings document
      const query = `*[_type == "siteSettings"][0]`;
      const existing = await this.sanity.fetch(query);
      
      if (existing) {
        // Update existing site settings document
        await this.sanity
          .patch(existing._id)
          .set({ alumniCount: count })
          .commit();
        console.log(`✅ Updated alumni count in site settings: ${count}`);
      } else {
        // Create new site settings document
        await this.sanity.create({
          _type: 'siteSettings',
          alumniCount: count
        });
        console.log(`✅ Created site settings with alumni count: ${count}`);
      }
    } catch (error) {
      console.error('Error updating alumni count in site settings:', error);
      throw error;
    }
  }

  /**
   * Send a notification for automation success
   */
  async notifyAutomationSuccess({ script, summary, results, duration }) {
    if (!this.slackEnabled) return;

    const durationText = duration ? ` (${Math.round(duration / 1000)}s)` : '';
    let message = `✅ *${script} Completed Successfully*${durationText}\n\n`;
    message += `📊 *Summary:* ${summary}\n\n`;
    
    if (results) {
      message += `📈 *Results:*\n`;
      if (results.created) message += `• ✅ Created: ${results.created}\n`;
      if (results.deleted) message += `• 🗑️ Deleted: ${results.deleted}\n`;
      if (results.processed) message += `• 📊 Processed: ${results.processed}\n`;
      if (results.skipped) message += `• ⏭️ Skipped: ${results.skipped}\n`;
    }

    message += `\n⏰ *Time:* ${new Date().toLocaleString()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendSlackMessage(message, blocks);
  }

  /**
   * Send a notification for automation failure
   */
  async notifyAutomationFailure({ script, error, context }) {
    if (!this.slackEnabled) return;

    let message = `❌ *${script} Failed*\n\n`;
    message += `🚨 *Error:* ${error.message}\n`;
    
    if (context) {
      message += `📝 *Context:* ${context}\n`;
    }

    message += `\n⏰ *Time:* ${new Date().toLocaleString()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    // Add error details in a code block
    if (error.stack) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`\n${error.stack}\n\`\`\``
        }
      });
    }

    await this.sendSlackMessage(message, blocks);
  }

  /**
   * Send notification for team members with failed avatar conversions
   */
  async notifyFailedAvatars(failedAvatars) {
    if (!this.slackEnabled || !failedAvatars || failedAvatars.length === 0) return;

    try {
      let message = `⚠️ *Team Member Avatar Conversion Failures*\n\n`;
      message += `The following team members were excluded from sync due to avatar conversion failures:\n\n`;

      failedAvatars.forEach((failedAvatar, index) => {
        message += `${index + 1}. *${failedAvatar.name}*\n`;
        message += `   • Avatar URL: ${failedAvatar.profileImage}\n`;
        message += `   • Error: ${failedAvatar.error}\n\n`;
      });

      message += `🔧 *Action Required:*\n`;
      message += `Please update the avatar URLs for these team members in Slack with valid image formats (JPEG, PNG, WebP, GIF, BMP, TIFF).\n\n`;
      message += `💡 *Tip:* Ensure the avatar URLs are publicly accessible and point to actual image files.`;

      const result = await this.slack.chat.postMessage({
        channel: this.slackChannel,
        text: 'Team Member Avatar Conversion Failures',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          }
        ]
      });

      console.log('✅ Failed avatars notification sent to Slack');
      return result;
    } catch (error) {
      console.error('❌ Error sending failed avatars notification:', error);
      return null;
    }
  }

  /**
   * Send a message to Slack
   */
  async sendSlackMessage(text, blocks = null) {
    if (!this.slackEnabled) {
      console.log('📱 Slack notification (disabled):', text);
      return;
    }

    try {
      const payload = {
        channel: this.slackChannel,
        text: text,
        blocks: blocks,
        unfurl_links: false,
        unfurl_media: false
      };

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Slack notification sent: ${result.ts}`);
        return result;
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to send Slack notification:', errorText);
        throw new Error(`Slack API error: ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error sending Slack notification:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const sync = new TeamMemberSync();
  try {
    await sync.sync();
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('sync-team-members.js')) {
  main();
}

export default TeamMemberSync;
