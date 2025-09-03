const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const smsService = require('../services/smsService');
const { generateToken, generateRefreshToken } = require('../middleware/auth');

// Validation rules
const phoneValidation = [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required')
    .custom((value) => {
      const validation = smsService.validatePhoneNumber(value);
      if (!validation.isValid) {
        throw new Error('Please enter a valid phone number');
      }
      return true;
    })
];

const otpValidation = [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers')
];

// Register or login with phone number
const registerPhone = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phoneNumber, deviceInfo } = req.body;
    
    // Validate and format phone number
    const phoneValidation = smsService.validatePhoneNumber(phoneNumber);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    const formattedPhone = phoneValidation.formatted;

    // Check if SMS service is configured
    if (!smsService.isConfigured()) {
      return res.status(500).json({
        success: false,
        message: 'SMS service is not configured'
      });
    }

    // Find or create user
    let user = await User.findOne({ phoneNumber: formattedPhone });
    
    if (!user) {
      // Create new user
      user = new User({
        phoneNumber: formattedPhone,
        deviceInfo: deviceInfo || {}
      });
    } else {
      // Update device info if provided
      if (deviceInfo) {
        user.deviceInfo = { ...user.deviceInfo, ...deviceInfo };
      }
      
      // Check if user can resend OTP (rate limiting)
      if (!user.canResendOTP()) {
        return res.status(429).json({
          success: false,
          message: 'Please wait before requesting another OTP',
          retryAfter: 60 // seconds
        });
      }
    }

    // Generate OTP
    const otp = user.generateOTP();
    
    // Save user
    await user.save();

    // Send OTP via SMS
    const smsResult = await smsService.sendOTP(formattedPhone, otp);
    
    if (!smsResult.success) {
      return res.status(500).json({
        success: false,
        message: smsResult.error || 'Failed to send OTP'
      });
    }

    console.log(`📱 OTP sent to ${formattedPhone} for user ${user._id}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber: formattedPhone,
        expiresIn: 600, // 10 minutes in seconds
        canResendAfter: 60 // 1 minute in seconds
      }
    });

  } catch (error) {
    console.error('Register phone error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phoneNumber } = req.body;
    
    const phoneValidation = smsService.validatePhoneNumber(phoneNumber);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    const formattedPhone = phoneValidation.formatted;
    
    // Find user
    const user = await User.findOne({ phoneNumber: formattedPhone });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Phone number not registered'
      });
    }

    // Check if user can resend OTP
    if (!user.canResendOTP()) {
      return res.status(429).json({
        success: false,
        message: 'Please wait before requesting another OTP',
        retryAfter: 60
      });
    }

    // Generate new OTP
    const otp = user.generateOTP();
    await user.save();

    // Send OTP
    const smsResult = await smsService.sendOTP(formattedPhone, otp);
    
    if (!smsResult.success) {
      return res.status(500).json({
        success: false,
        message: smsResult.error || 'Failed to send OTP'
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        phoneNumber: formattedPhone,
        expiresIn: 600,
        canResendAfter: 60
      }
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify OTP and complete authentication
const verifyOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phoneNumber, otp } = req.body;
    
    const phoneValidation = smsService.validatePhoneNumber(phoneNumber);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    const formattedPhone = phoneValidation.formatted;
    
    // Find user
    const user = await User.findOne({ phoneNumber: formattedPhone });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Phone number not registered'
      });
    }

    // Verify OTP
    const verificationResult = user.verifyOTP(otp);
    
    if (!verificationResult.success) {
      await user.save(); // Save updated attempt count
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }

    // Update last login
    await user.updateLastLogin();
    await user.save();

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Send welcome message (don't wait for it)
    smsService.sendWelcomeMessage(formattedPhone, user.profile?.firstName)
      .catch(err => console.error('Welcome SMS error:', err));

    console.log(`✅ User ${user._id} verified and logged in`);

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
      data: {
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified,
          status: user.status,
          profile: user.profile,
          createdAt: user.createdAt
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 30 * 24 * 60 * 60 // 30 days in seconds
        }
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Refresh access token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    const { verifyRefreshToken } = require('../middleware/auth');
    const decoded = verifyRefreshToken(refreshToken);
    
    // Find user
    const user = await User.findById(decoded.userId).select('-otp');
    
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new access token
    const newAccessToken = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        expiresIn: 30 * 24 * 60 * 60
      }
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
};

module.exports = {
  registerPhone,
  resendOTP,
  verifyOTP,
  refreshToken,
  phoneValidation,
  otpValidation
};