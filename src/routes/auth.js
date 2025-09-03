const express = require('express');
const router = express.Router();
const {
  registerPhone,
  resendOTP,
  verifyOTP,
  refreshToken,
  phoneValidation,
  otpValidation
} = require('../controllers/authController');
const { authenticateToken, requireVerified } = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register or login with phone number (sends OTP)
// @access  Public
router.post('/register', phoneValidation, registerPhone);

// @route   POST /api/auth/resend-otp
// @desc    Resend OTP to phone number
// @access  Public
router.post('/resend-otp', phoneValidation, resendOTP);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and complete authentication
// @access  Public
router.post('/verify-otp', otpValidation, verifyOTP);

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token using refresh token
// @access  Public
router.post('/refresh-token', refreshToken);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateToken, requireVerified, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user: {
          id: req.user._id,
          phoneNumber: req.user.phoneNumber,
          isVerified: req.user.isVerified,
          status: req.user.status,
          profile: req.user.profile,
          lastLoginAt: req.user.lastLoginAt,
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, requireVerified, async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    const User = require('../models/User');
    
    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Update profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          'profile.firstName': firstName,
          'profile.lastName': lastName,
          'profile.email': email
        }
      },
      { new: true, runValidators: true }
    ).select('-otp');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser._id,
          phoneNumber: updatedUser.phoneNumber,
          isVerified: updatedUser.isVerified,
          status: updatedUser.status,
          profile: updatedUser.profile,
          lastLoginAt: updatedUser.lastLoginAt,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client should delete tokens)
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a more sophisticated setup, you might want to blacklist the token
    // For now, we'll just return success and let the client handle token deletion
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/auth/account
// @desc    Delete user account
// @access  Private
router.delete('/account', authenticateToken, requireVerified, async (req, res) => {
  try {
    const User = require('../models/User');
    
    await User.findByIdAndDelete(req.user._id);
    
    console.log(`🗑️  User account deleted: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;