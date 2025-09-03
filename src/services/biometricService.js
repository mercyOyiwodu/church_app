const crypto = require('crypto');
const Admin = require('../models/Admin');

class BiometricService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
  }

  /**
   * Generate a challenge for biometric authentication
   * @param {string} adminId - Admin ID
   * @returns {Object} Challenge data
   */
  generateChallenge(adminId) {
    const challenge = crypto.randomBytes(32).toString('base64');
    const timestamp = Date.now();
    const expiresAt = timestamp + (5 * 60 * 1000); // 5 minutes
    
    return {
      challenge,
      adminId,
      timestamp,
      expiresAt,
      id: crypto.randomUUID()
    };
  }

  /**
   * Verify biometric authentication challenge
   * @param {Object} challengeData - Challenge data
   * @param {string} signature - Biometric signature
   * @param {string} publicKey - Admin's public key
   * @returns {Object} Verification result
   */
  verifyChallenge(challengeData, signature, publicKey) {
    try {
      // Check if challenge has expired
      if (Date.now() > challengeData.expiresAt) {
        return {
          success: false,
          message: 'Challenge has expired'
        };
      }

      // Verify the signature using the public key
      const verifier = crypto.createVerify('SHA256');
      verifier.update(challengeData.challenge);
      
      const isValid = verifier.verify(publicKey, signature, 'base64');
      
      if (!isValid) {
        return {
          success: false,
          message: 'Invalid biometric signature'
        };
      }

      return {
        success: true,
        message: 'Biometric authentication successful'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Biometric verification failed',
        error: error.message
      };
    }
  }

  /**
   * Register biometric data for an admin
   * @param {string} adminId - Admin ID
   * @param {string} publicKey - Public key from biometric enrollment
   * @param {string} keyId - Unique identifier for the key
   * @returns {Object} Registration result
   */
  async registerBiometric(adminId, publicKey, keyId) {
    try {
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return {
          success: false,
          message: 'Admin not found'
        };
      }

      // Validate public key format
      if (!this.validatePublicKey(publicKey)) {
        return {
          success: false,
          message: 'Invalid public key format'
        };
      }

      // Update admin with biometric data
      admin.biometricData = {
        publicKey: publicKey,
        keyId: keyId,
        lastUsed: null
      };
      admin.biometricEnabled = true;

      await admin.save();
      await admin.logActivity('biometric_registered', { keyId });

      return {
        success: true,
        message: 'Biometric authentication registered successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to register biometric data',
        error: error.message
      };
    }
  }

  /**
   * Remove biometric data for an admin
   * @param {string} adminId - Admin ID
   * @returns {Object} Removal result
   */
  async removeBiometric(adminId) {
    try {
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return {
          success: false,
          message: 'Admin not found'
        };
      }

      admin.biometricData = {
        publicKey: null,
        keyId: null,
        lastUsed: null
      };
      admin.biometricEnabled = false;

      await admin.save();
      await admin.logActivity('biometric_removed');

      return {
        success: true,
        message: 'Biometric authentication removed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to remove biometric data',
        error: error.message
      };
    }
  }

  /**
   * Update last used timestamp for biometric authentication
   * @param {string} adminId - Admin ID
   * @returns {Object} Update result
   */
  async updateLastUsed(adminId) {
    try {
      const admin = await Admin.findById(adminId);
      if (!admin || !admin.biometricEnabled) {
        return {
          success: false,
          message: 'Biometric authentication not enabled'
        };
      }

      admin.biometricData.lastUsed = new Date();
      await admin.save();

      return {
        success: true,
        message: 'Last used timestamp updated'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update last used timestamp',
        error: error.message
      };
    }
  }

  /**
   * Check if admin has biometric authentication enabled
   * @param {string} adminId - Admin ID
   * @returns {Object} Status result
   */
  async getBiometricStatus(adminId) {
    try {
      const admin = await Admin.findById(adminId).select('biometricEnabled biometricData');
      if (!admin) {
        return {
          success: false,
          message: 'Admin not found'
        };
      }

      return {
        success: true,
        enabled: admin.biometricEnabled,
        hasData: !!(admin.biometricData && admin.biometricData.publicKey),
        keyId: admin.biometricData?.keyId || null,
        lastUsed: admin.biometricData?.lastUsed || null
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get biometric status',
        error: error.message
      };
    }
  }

  /**
   * Validate public key format
   * @param {string} publicKey - Public key to validate
   * @returns {boolean} Validation result
   */
  validatePublicKey(publicKey) {
    try {
      // Basic validation - check if it's a valid base64 string
      const decoded = Buffer.from(publicKey, 'base64');
      return decoded.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a secure random token for fallback authentication
   * @returns {string} Random token
   */
  generateFallbackToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt sensitive biometric data
   * @param {string} data - Data to encrypt
   * @param {string} key - Encryption key
   * @returns {Object} Encrypted data with IV and tag
   */
  encryptData(data, key) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt sensitive biometric data
   * @param {Object} encryptedData - Encrypted data object
   * @param {string} key - Decryption key
   * @returns {string} Decrypted data
   */
  decryptData(encryptedData, key) {
    const { encrypted, iv, tag } = encryptedData;
    
    const decipher = crypto.createDecipher(this.algorithm, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate device-specific biometric key
   * @param {string} deviceId - Device identifier
   * @param {string} adminId - Admin identifier
   * @returns {string} Device-specific key
   */
  generateDeviceKey(deviceId, adminId) {
    const data = `${deviceId}:${adminId}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

module.exports = new BiometricService();