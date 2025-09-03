const Admin = require('../models/Admin');
const biometricService = require('../services/biometricService');
const { generateTokens } = require('../middleware/auth');

/**
 * Generate biometric authentication challenge
 */
const generateChallenge = async (req, res) => {
  try {
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID is required'
      });
    }

    // Check if admin exists and has biometric enabled
    const admin = await Admin.findById(adminId).select('biometricEnabled biometricData');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    if (!admin.biometricEnabled || !admin.biometricData?.publicKey) {
      return res.status(400).json({
        success: false,
        message: 'Biometric authentication not enabled for this admin'
      });
    }

    // Generate challenge
    const challenge = biometricService.generateChallenge(adminId);

    // Store challenge temporarily (in production, use Redis or similar)
    // For now, we'll include it in the response
    res.status(200).json({
      success: true,
      message: 'Challenge generated successfully',
      data: {
        challengeId: challenge.id,
        challenge: challenge.challenge,
        expiresAt: challenge.expiresAt
      }
    });
  } catch (error) {
    console.error('Generate challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify biometric authentication
 */
const verifyBiometric = async (req, res) => {
  try {
    const { adminId, challengeId, challenge, signature, deviceInfo } = req.body;

    if (!adminId || !challengeId || !challenge || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: adminId, challengeId, challenge, signature'
      });
    }

    // Get admin with biometric data
    const admin = await Admin.findById(adminId).select('+password');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    if (!admin.biometricEnabled || !admin.biometricData?.publicKey) {
      return res.status(400).json({
        success: false,
        message: 'Biometric authentication not enabled'
      });
    }

    if (admin.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Admin account is not active'
      });
    }

    if (admin.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Admin account is temporarily locked'
      });
    }

    // Reconstruct challenge data
    const challengeData = {
      challenge,
      adminId,
      expiresAt: Date.now() + (5 * 60 * 1000) // Assume 5 minutes from now
    };

    // Verify biometric signature
    const verificationResult = biometricService.verifyChallenge(
      challengeData,
      signature,
      admin.biometricData.publicKey
    );

    if (!verificationResult.success) {
      // Increment login attempts on failed biometric verification
      await admin.incrementLoginAttempts();
      await admin.logActivity('biometric_auth_failed', {
        reason: verificationResult.message,
        deviceInfo
      }, req);

      return res.status(401).json({
        success: false,
        message: verificationResult.message
      });
    }

    // Successful biometric authentication
    await admin.resetLoginAttempts();
    await biometricService.updateLastUsed(adminId);

    // Update admin login info
    admin.lastLoginAt = new Date();
    if (deviceInfo) {
      admin.deviceInfo = {
        ...admin.deviceInfo,
        ...deviceInfo,
        lastIpAddress: req.ip || req.connection.remoteAddress
      };
    }
    await admin.save();

    // Log successful authentication
    await admin.logActivity('biometric_auth_success', {
      challengeId,
      deviceInfo
    }, req);

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(admin._id, 'admin');

    res.status(200).json({
      success: true,
      message: 'Biometric authentication successful',
      data: {
        admin: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          lastLoginAt: admin.lastLoginAt
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error('Verify biometric error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Register biometric authentication
 */
const registerBiometric = async (req, res) => {
  try {
    const { publicKey, keyId, deviceInfo } = req.body;
    const adminId = req.admin.id;

    if (!publicKey || !keyId) {
      return res.status(400).json({
        success: false,
        message: 'Public key and key ID are required'
      });
    }

    const result = await biometricService.registerBiometric(adminId, publicKey, keyId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log the registration
    const admin = await Admin.findById(adminId);
    await admin.logActivity('biometric_registered', {
      keyId,
      deviceInfo
    }, req);

    res.status(200).json({
      success: true,
      message: 'Biometric authentication registered successfully',
      data: {
        keyId,
        registeredAt: new Date()
      }
    });
  } catch (error) {
    console.error('Register biometric error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Remove biometric authentication
 */
const removeBiometric = async (req, res) => {
  try {
    const adminId = req.admin.id;

    const result = await biometricService.removeBiometric(adminId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log the removal
    const admin = await Admin.findById(adminId);
    await admin.logActivity('biometric_removed', {}, req);

    res.status(200).json({
      success: true,
      message: 'Biometric authentication removed successfully'
    });
  } catch (error) {
    console.error('Remove biometric error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get biometric authentication status
 */
const getBiometricStatus = async (req, res) => {
  try {
    const adminId = req.admin.id;

    const result = await biometricService.getBiometricStatus(adminId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json({
      success: true,
      message: 'Biometric status retrieved successfully',
      data: {
        enabled: result.enabled,
        hasData: result.hasData,
        keyId: result.keyId,
        lastUsed: result.lastUsed
      }
    });
  } catch (error) {
    console.error('Get biometric status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Generate fallback authentication code
 */
const generateFallbackCode = async (req, res) => {
  try {
    const adminId = req.admin.id;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Generate OTP as fallback
    const otp = admin.generateOTP();
    await admin.save();

    // In production, send this via SMS or email
    // For development, return it in response
    const response = {
      success: true,
      message: 'Fallback authentication code generated'
    };

    if (process.env.NODE_ENV === 'development') {
      response.data = { otp };
    }

    await admin.logActivity('fallback_code_generated', {}, req);

    res.status(200).json(response);
  } catch (error) {
    console.error('Generate fallback code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify fallback authentication code
 */
const verifyFallbackCode = async (req, res) => {
  try {
    const { adminId, code, deviceInfo } = req.body;

    if (!adminId || !code) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID and code are required'
      });
    }

    const admin = await Admin.findById(adminId).select('+password');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    if (admin.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Admin account is not active'
      });
    }

    if (admin.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Admin account is temporarily locked'
      });
    }

    // Verify OTP
    const verificationResult = admin.verifyOTP(code);

    if (!verificationResult.success) {
      await admin.incrementLoginAttempts();
      await admin.save();
      await admin.logActivity('fallback_auth_failed', {
        reason: verificationResult.message,
        deviceInfo
      }, req);

      return res.status(401).json({
        success: false,
        message: verificationResult.message
      });
    }

    // Successful authentication
    await admin.resetLoginAttempts();
    admin.lastLoginAt = new Date();
    if (deviceInfo) {
      admin.deviceInfo = {
        ...admin.deviceInfo,
        ...deviceInfo,
        lastIpAddress: req.ip || req.connection.remoteAddress
      };
    }
    await admin.save();

    await admin.logActivity('fallback_auth_success', { deviceInfo }, req);

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(admin._id, 'admin');

    res.status(200).json({
      success: true,
      message: 'Fallback authentication successful',
      data: {
        admin: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          lastLoginAt: admin.lastLoginAt
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error('Verify fallback code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  generateChallenge,
  verifyBiometric,
  registerBiometric,
  removeBiometric,
  getBiometricStatus,
  generateFallbackCode,
  verifyFallbackCode
};