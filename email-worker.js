/**
 * Cloudflare Email Worker for 180dc-escp.org
 * Handles email forwarding and processing
 */

export default {
  async email(message, env, ctx) {
    // Get email details at the top level for error handling
    const to = message.to;
    const from = message.from;
    const subject = message.headers.get('subject') || 'No Subject';
    const destinationEmail = 'sebimichel1@gmail.com';
    
    try {
      // Log email details for debugging
      console.log(`📧 Email received:`);
      console.log(`   To: ${to}`);
      console.log(`   From: ${from}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Date: ${new Date().toISOString()}`);
      
      // Log email processing (headers are immutable on ForwardableEmailMessage)
      console.log(`📊 Processing email from ${from} to ${to}`);
      
      console.log(`📤 Forwarding to: ${destinationEmail}`);
      
      // Forward the email with extensive logging
      console.log(`🔄 Starting email forward process...`);
      const forwardStartTime = Date.now();
      
      try {
        console.log(`🔄 Attempting to forward email to: ${destinationEmail}`);
        console.log(`📧 Email size: ${message.rawSize || 'unknown'} bytes`);
        console.log(`📧 Email headers: ${JSON.stringify(Object.fromEntries(message.headers.entries()))}`);
        
        await message.forward(destinationEmail);
        const forwardDuration = Date.now() - forwardStartTime;
        console.log(`✅ Email forward completed in ${forwardDuration}ms`);
        console.log(`📬 Email should now be delivered to: ${destinationEmail}`);
        console.log(`🔍 Forward process completed without errors`);
        
        // Additional logging for delivery tracking
        console.log(`📋 Delivery Details:`);
        console.log(`   From: ${from}`);
        console.log(`   To: ${to}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Forwarded To: ${destinationEmail}`);
        console.log(`   Message ID: ${message.headers.get('message-id')}`);
        console.log(`   Forward Duration: ${forwardDuration}ms`);
        
      } catch (forwardError) {
        console.error(`❌ Email forward failed:`, forwardError);
        console.error(`❌ Forward error details:`, {
          message: forwardError.message,
          stack: forwardError.stack,
          name: forwardError.name
        });
        throw forwardError;
      }
      
      // Log email details for debugging delivery
      console.log(`📋 Email Details:`);
      console.log(`   Original From: ${from}`);
      console.log(`   Original To: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Forwarded To: ${destinationEmail}`);
      console.log(`   Message ID: ${message.headers.get('message-id') || 'No Message ID'}`);
      console.log(`   Date: ${message.headers.get('date') || 'No Date'}`);
      
      // Optional: Send auto-reply for certain types of emails
      if (from.includes('noreply') || from.includes('no-reply')) {
        console.log(`🤖 Sending auto-reply to: ${from}`);
        try {
          await message.reply(
            'Thank you for contacting 180 Degrees Consulting ESCP. We have received your message and will respond within 24 hours.\n\nBest regards,\nThe 180DC ESCP Team'
          );
          console.log(`✅ Auto-reply sent successfully`);
        } catch (replyError) {
          console.error(`❌ Auto-reply failed:`, replyError);
        }
      }
      
      console.log(`✅ Email processed successfully`);
      console.log(`📧 Email forwarding complete - check ${destinationEmail} for delivery`);
      
    } catch (error) {
      console.error(`❌ Error processing email:`, error);
      
      // Log error with proper variable scope
      console.error(`❌ Email processing failed for ${from} to ${to}: ${error.message}`);
      
      // Log specific error details
      if (error.message.includes('destination address not verified')) {
        console.error(`🚨 Destination email ${destinationEmail} needs to be verified in Cloudflare Email Routing`);
        console.error(`🔧 To fix: Go to Cloudflare Dashboard → Email Routing → Add destination: ${destinationEmail}`);
        console.error(`📧 The email address exists but needs to be added to Cloudflare Email Routing destinations`);
      } else if (error.message.includes('no such user')) {
        console.error(`🚨 Email address ${destinationEmail} doesn't exist or is not configured`);
        console.error(`🔧 Check if the email address is set up correctly on the 180dc.org mail server`);
      } else {
        console.error(`🚨 Unknown email delivery error: ${error.message}`);
        console.error(`🔧 This could be a mail server configuration issue`);
      }
    }
  }
};
