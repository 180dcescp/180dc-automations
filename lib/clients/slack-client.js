import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

class SlackClient {
  constructor() {
    this.client = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.channel = process.env.SLACK_CHANNEL || '#team-updates';
    
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
   * Format: "Associate Director - Consulting (CASIE, FEBA, Solidar, Stealth Startup, CMT, CASA)"
   * Returns: { position: "Associate Director", department: "Consulting" }
   * 
   * Edge cases:
   * - President/Vice-President: Use "Presidency" as department
   * - Alumni: Skip these members entirely
   */
  parseTitle(title) {
    if (!title || typeof title !== 'string') {
      return { position: '', department: '', isAlumni: false };
    }

    // Check if this is an alumni member
    if (title.toLowerCase().includes('alumni')) {
      return { position: '', department: '', isAlumni: true };
    }

    // Remove everything in brackets (if any)
    const cleanTitle = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
    
    // Split by " - " to separate position and department
    const parts = cleanTitle.split(' - ');
    
    if (parts.length === 2) {
      const position = parts[0].trim();
      const department = parts[1].trim();
      
      // Special case: President and Vice-President get "Presidency" as department
      if (position === 'President' || position === 'Vice-President') {
        return {
          position: position,
          department: 'Presidency',
          isAlumni: false
        };
      }
      
      // Special case: Consultant, Senior Consultant, Project Leader get "Consultants" as department
      if (position === 'Consultant' || position === 'Senior Consultant' || position === 'Project Leader') {
        return {
          position: position,
          department: 'Consultants',
          isAlumni: false
        };
      }
      
      return {
        position: position,
        department: department,
        isAlumni: false
      };
    } else if (parts.length === 1) {
      const position = parts[0].trim();
      
      // Special case: President and Vice-President get "Presidency" as department
      if (position === 'President' || position === 'Vice-President') {
        return {
          position: position,
          department: 'Presidency',
          isAlumni: false
        };
      }
      
      // Special case: Consultant, Senior Consultant, Project Leader get "Consultants" as department
      if (position === 'Consultant' || position === 'Senior Consultant' || position === 'Project Leader') {
        return {
          position: position,
          department: 'Consultants',
          isAlumni: false
        };
      }
      
      // If no " - " separator, treat the whole thing as position
      return {
        position: position,
        department: '',
        isAlumni: false
      };
    }
    
    return { position: '', department: '', isAlumni: false };
  }

  /**
   * Analyze image colors to detect if one color covers more than 80% of the image
   * This helps identify Slack default avatars which are typically solid colors
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
   * Now uses both URL pattern matching and color analysis
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
    
    // Additional check for Gravatar URLs with Slack default fallback
    if (imageUrl.includes('secure.gravatar.com/avatar/') && imageUrl.includes('d=https%3A%2F%2Fa.slack-edge.com%2Fdf10d%2Fimg%2Favatars%2Fava_')) {
      console.log(`🔍 ${memberName}: Gravatar fallback pattern - DEFAULT`);
      return { isDefault: true, method: 'gravatar-fallback' };
    }
    
    // Check for generic Gravatar patterns
    const genericPatterns = [
      /\/avatar\/[a-f0-9]{32}\?d=identicon/i,
      /\/avatar\/[a-f0-9]{32}\?d=mm/i,
      /\/avatar\/[a-f0-9]{32}\?d=retro/i,
      /\/avatar\/[a-f0-9]{32}\?d=wavatar/i,
      /\/avatar\/[a-f0-9]{32}\?d=monsterid/i,
      /\/avatar\/[a-f0-9]{32}\?d=robohash/i
    ];
    
    const isGenericDefault = genericPatterns.some(pattern => pattern.test(imageUrl));
    if (isGenericDefault) {
      console.log(`🔍 ${memberName}: Generic Gravatar pattern - DEFAULT`);
      return { isDefault: true, method: 'gravatar-generic' };
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
      const result = await this.client.users.list({
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
      const result = await this.client.users.list({
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
        const { position, department, isAlumni } = this.parseTitle(profile.title);
        
        // Get the best available profile image
        const profileImage = profile.image_512 || profile.image_192 || profile.image_72;
        
        // Check if it's a default avatar (now async)
        const avatarResult = await this.isDefaultSlackAvatar(profileImage, profile.real_name || profile.display_name || member.name);
        
        return {
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

      // Debug: Show all avatar URLs to understand the patterns
      console.log(`\n🔍 All avatar URLs:`);
      allMembers.forEach(member => {
        if (member.profileImage) {
          console.log(`  - ${member.name}: ${member.profileImage}`);
        } else {
          console.log(`  - ${member.name}: No profile image`);
        }
      });

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

      // Generate avatar detection summary (only for team members, not alumni)
      const avatarStats = {
        total: teamMembers.length,
        noImage: 0,
        urlPattern: 0,
        gravatarFallback: 0,
        gravatarGeneric: 0,
        'color-analysis': 0,
        realAvatar: 0,
        analysisFailed: 0
      };

      teamMembers.forEach(member => {
        if (member.avatarMethod) {
          avatarStats[member.avatarMethod] = (avatarStats[member.avatarMethod] || 0) + 1;
        }
      });

      console.log(`\n📊 Avatar Detection Summary:`);
      console.log(`  Total members analyzed: ${avatarStats.total}`);
      console.log(`  No profile image: ${avatarStats.noImage}`);
      console.log(`  URL pattern match: ${avatarStats.urlPattern}`);
      console.log(`  Gravatar fallback: ${avatarStats.gravatarFallback}`);
      console.log(`  Gravatar generic: ${avatarStats.gravatarGeneric}`);
      console.log(`  Color analysis (>70% coverage): ${avatarStats['color-analysis']}`);
      console.log(`  Real avatars: ${avatarStats.realAvatar}`);
      console.log(`  Analysis failed: ${avatarStats.analysisFailed}`);

      console.log(`\nProcessed ${teamMembers.length} active team members with complete data`);
      return teamMembers;
    } catch (error) {
      console.error('Error fetching team members from Slack:', error);
      throw error;
    }
  }

  /**
   * Send a message to Slack
   */
  async sendMessage(text, blocks = null) {
    try {
      const result = await this.client.chat.postMessage({
        channel: this.channel,
        text: text,
        blocks: blocks,
        unfurl_links: false,
        unfurl_media: false
      });

      console.log(`✅ Slack message sent: ${result.ts}`);
      return result;
    } catch (error) {
      console.error('❌ Error sending Slack message:', error);
      throw error;
    }
  }

  /**
   * Send team member sync results to Slack
   */
  async notifySyncResults(results) {
    const { created, updated, deleted, errors } = results;
    
    let message = `🔄 *Team Member Sync Complete*\n\n`;
    message += `📊 *Results:*\n`;
    message += `• ✅ Created: ${created}\n`;
    message += `• 🔄 Updated: ${updated}\n`;
    message += `• 🗑️ Deleted: ${deleted}\n`;
    
    if (errors.length > 0) {
      message += `\n❌ *Errors:*\n`;
      errors.forEach(error => {
        message += `• ${error.name}: ${error.error}\n`;
      });
    }

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendMessage(message, blocks);
  }

  /**
   * Send notification for new team member
   */
  async notifyNewTeamMember(memberData) {
    const message = `🎉 *New Team Member Added!*\n\n` +
      `👤 *${memberData.name}*\n` +
      `💼 ${memberData.role || 'Role not specified'}\n` +
      `🏢 ${memberData.department || 'Department not specified'}\n` +
      `📧 ${memberData.email || 'No email'}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendMessage(message, blocks);
  }

  /**
   * Send notification for updated team member
   */
  async notifyUpdatedTeamMember(memberData) {
    const message = `🔄 *Team Member Updated*\n\n` +
      `👤 *${memberData.name}*\n` +
      `💼 ${memberData.role || 'Role not specified'}\n` +
      `🏢 ${memberData.department || 'Department not specified'}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendMessage(message, blocks);
  }

  /**
   * Send notification for deleted team member
   */
  async notifyDeletedTeamMember(memberName) {
    const message = `🗑️ *Team Member Removed*\n\n` +
      `👤 *${memberName}*\n` +
      `This member is no longer in the Google Sheets database.`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendMessage(message, blocks);
  }

  /**
   * Send error notification
   */
  async notifyError(error, context = '') {
    const message = `❌ *Sync Error${context ? ` - ${context}` : ''}*\n\n` +
      `Error: ${error.message}\n` +
      `Time: ${new Date().toLocaleString()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendMessage(message, blocks);
  }

  /**
   * Send sync started notification
   */
  async notifySyncStarted() {
    const message = `🚀 *Starting Team Member Sync*\n\n` +
      `Syncing data from Google Sheets to Sanity CMS...\n` +
      `Time: ${new Date().toLocaleString()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    await this.sendMessage(message, blocks);
  }

  /**
   * Test the connection to Slack
   */
  async testConnection() {
    try {
      const result = await this.client.auth.test();
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
   * Get channel information
   */
  async getChannelInfo() {
    try {
      const result = await this.client.conversations.info({
        channel: this.channel
      });
      return result.channel;
    } catch (error) {
      console.error('Error getting channel info:', error);
      return null;
    }
  }
}

export default SlackClient;
