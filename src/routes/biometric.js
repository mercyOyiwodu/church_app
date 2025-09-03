const express = require('express');
const router = express.Router();
const {
  generateChallenge,
  verifyBiometric,
  registerBiometric,
  removeBiometric,
  getBiometricStatus,
  generateFallbackCode,
  verifyFallbackCode
} = require('../controllers/biometricController');
const { authenticateToken } = require('../middleware/auth');

// Public routes (no authentication required)

/**
 * @route POST /api/biometric/challenge
 * @desc Generate biometric authentication challenge
 * @access Public
 */
router.post('/challenge', generateChallenge);

/**
 * @route POST /api/biometric/verify
 * @desc Verify biometric authentication
 * @access Public
 */
router.post('/verify', verifyBiometric);

/**
 * @route POST /api/biometric/fallback/verify
 * @desc Verify fallback authentication code
 * @access Public
 */
router.post('/fallback/verify', verifyFallbackCode);

// Protected routes (authentication required)

/**
 * @route POST /api/biometric/register
 * @desc Register biometric authentication for admin
 * @access Private (Admin only)
 */
router.post('/register', authenticateToken, registerBiometric);

/**
 * @route DELETE /api/biometric/remove
 * @desc Remove biometric authentication for admin
 * @access Private (Admin only)
 */
router.delete('/remove', authenticateToken, removeBiometric);

/**
 * @route GET /api/biometric/status
 * @desc Get biometric authentication status
 * @access Private (Admin only)
 */
router.get('/status', authenticateToken, getBiometricStatus);

/**
 * @route POST /api/biometric/fallback/generate
 * @desc Generate fallback authentication code
 * @access Private (Admin only)
 */
router.post('/fallback/generate', authenticateToken, generateFallbackCode);

module.exports = router;