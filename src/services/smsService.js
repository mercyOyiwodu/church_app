const twilio = require('twilio');

class SMSService {
  constructor() {
    this.client = null;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    this.isEnabled = process.env.NODE_ENV === 'production' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;
    
    if (this.isEnabled) {
      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
  }

  async sendOTP(phoneNumber, otp) {
    try {
      const message = `Your Church App verification code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;
      
      if (!this.isEnabled) {
        // Development mode - log OTP instead of sending SMS
        console.log(`📱 SMS (DEV MODE) to ${phoneNumber}: ${message}`);
        console.log(`🔐 OTP Code: ${otp}`);
        return {
          success: true,
          messageId: 'dev_mode_' + Date.now(),
          message: 'OTP sent successfully (development mode)'
        };
      }

      if (!this.fromNumber) {
        throw new Error('Twilio phone number not configured');
      }

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber
      });

      console.log(`📱 SMS sent to ${phoneNumber}, SID: ${result.sid}`);
      
      return {
        success: true,
        messageId: result.sid,
        message: 'OTP sent successfully'
      };
    } catch (error) {
      console.error('SMS sending error:', error);
      
      // Handle specific Twilio errors
      if (error.code === 21211) {
        return {
          success: false,
          error: 'Invalid phone number format'
        };
      }
      
      if (error.code === 21614) {
        return {
          success: false,
          error: 'Phone number is not a valid mobile number'
        };
      }
      
      return {
        success: false,
        error: 'Failed to send SMS. Please try again.'
      };
    }
  }

  async sendWelcomeMessage(phoneNumber, firstName) {
    try {
      const message = `Welcome to Church App, ${firstName || 'there'}! 🙏 Your account has been successfully verified. We're excited to have you join our community.`;
      
      if (!this.isEnabled) {
        console.log(`📱 Welcome SMS (DEV MODE) to ${phoneNumber}: ${message}`);
        return { success: true, messageId: 'dev_welcome_' + Date.now() };
      }

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber
      });

      console.log(`📱 Welcome SMS sent to ${phoneNumber}, SID: ${result.sid}`);
      
      return {
        success: true,
        messageId: result.sid
      };
    } catch (error) {
      console.error('Welcome SMS error:', error);
      // Don't fail the verification process if welcome SMS fails
      return {
        success: false,
        error: 'Welcome message could not be sent'
      };
    }
  }

  // Validate phone number format
  validatePhoneNumber(phoneNumber) {
    // Remove all non-digit characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Check if it's a valid international format
    const internationalRegex = /^\+[1-9]\d{1,14}$/;
    
    if (internationalRegex.test(cleaned)) {
      return {
        isValid: true,
        formatted: cleaned
      };
    }
    
    // Check if it's a US number without country code
    const usRegex = /^\d{10}$/;
    if (usRegex.test(cleaned)) {
      return {
        isValid: true,
        formatted: '+1' + cleaned
      };
    }
    
    return {
      isValid: false,
      formatted: null
    };
  }

  // Check if SMS service is properly configured
  isConfigured() {
    return this.isEnabled || process.env.NODE_ENV === 'development';
  }
}

module.exports = new SMSService();