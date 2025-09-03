const express = require('express');
const router = express.Router();
const {
  getSystemSettings,
  getSettingsCategory,
  updateSystemSettings,
  updateSettingsCategory,
  getSettingsHistory,
  resetSettingsToDefault,
  exportSettings,
  importSettings,
  testSettings
} = require('../controllers/systemSettingsController');
const { authenticateToken } = require('../middleware/auth');
const {
  requireAnyAdmin,
  requireAdminOrAbove,
  requireSuperAdmin,
  requirePermission,
  auditLog,
  rateLimitSensitiveOps
} = require('../middleware/rbac');

// Middleware to ensure user is admin
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.userType === 'admin') {
    req.admin = req.user;
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
};

/**
 * @route GET /api/settings
 * @desc Get all system settings
 * @access Private (Admin or above)
 */
router.get('/', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  auditLog('view_system_settings'),
  getSystemSettings
);

/**
 * @route GET /api/settings/:category
 * @desc Get specific settings category
 * @access Private (Admin or above)
 */
router.get('/:category', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  auditLog('view_settings_category'),
  getSettingsCategory
);

/**
 * @route PUT /api/settings
 * @desc Update system settings
 * @access Private (Super Admin only)
 */
router.put('/', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  rateLimitSensitiveOps,
  auditLog('update_system_settings'),
  updateSystemSettings
);

/**
 * @route PUT /api/settings/:category
 * @desc Update specific settings category
 * @access Private (Super Admin only)
 */
router.put('/:category', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  rateLimitSensitiveOps,
  auditLog('update_settings_category'),
  updateSettingsCategory
);

/**
 * @route GET /api/settings/history/changes
 * @desc Get settings change history
 * @access Private (Super Admin only)
 */
router.get('/history/changes', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  auditLog('view_settings_history'),
  getSettingsHistory
);

/**
 * @route POST /api/settings/reset
 * @desc Reset settings to default values
 * @access Private (Super Admin only)
 */
router.post('/reset', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  rateLimitSensitiveOps,
  auditLog('reset_settings'),
  resetSettingsToDefault
);

/**
 * @route GET /api/settings/export/config
 * @desc Export settings configuration
 * @access Private (Super Admin only)
 */
router.get('/export/config', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  auditLog('export_settings'),
  exportSettings
);

/**
 * @route POST /api/settings/import/config
 * @desc Import settings configuration
 * @access Private (Super Admin only)
 */
router.post('/import/config', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  rateLimitSensitiveOps,
  auditLog('import_settings'),
  importSettings
);

/**
 * @route POST /api/settings/test
 * @desc Test settings configuration
 * @access Private (Super Admin only)
 */
router.post('/test', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  auditLog('test_settings'),
  testSettings
);

module.exports = router;