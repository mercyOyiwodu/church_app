const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUserStatus,
  verifyUser,
  resetUserPassword,
  deleteUser,
  getUserActivityLogs,
  bulkUserOperations
} = require('../controllers/userManagementController');
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
 * @route GET /api/users
 * @desc Get all users with pagination and filtering
 * @access Private (Any Admin)
 */
router.get('/', 
  authenticateToken, 
  requireAdmin, 
  requireAnyAdmin, 
  auditLog('view_all_users'),
  getAllUsers
);

/**
 * @route GET /api/users/:userId
 * @desc Get user by ID
 * @access Private (Any Admin)
 */
router.get('/:userId', 
  authenticateToken, 
  requireAdmin, 
  requireAnyAdmin, 
  auditLog('view_user_details'),
  getUserById
);

/**
 * @route PUT /api/users/:userId/status
 * @desc Update user status (active, suspended, banned, pending)
 * @access Private (Admin or above)
 */
router.put('/:userId/status', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  rateLimitSensitiveOps,
  auditLog('update_user_status'),
  updateUserStatus
);

/**
 * @route PUT /api/users/:userId/verify
 * @desc Manually verify a user
 * @access Private (Admin or above)
 */
router.put('/:userId/verify', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  rateLimitSensitiveOps,
  auditLog('verify_user'),
  verifyUser
);

/**
 * @route PUT /api/users/:userId/reset-password
 * @desc Reset user password
 * @access Private (Admin or above)
 */
router.put('/:userId/reset-password', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  rateLimitSensitiveOps,
  auditLog('reset_user_password'),
  resetUserPassword
);

/**
 * @route DELETE /api/users/:userId
 * @desc Delete user account (soft or hard delete)
 * @access Private (Super Admin only for hard delete, Admin+ for soft delete)
 */
router.delete('/:userId', 
  authenticateToken, 
  requireAdmin, 
  (req, res, next) => {
    // Check if hard delete is requested
    if (req.body.hardDelete === true) {
      return requireSuperAdmin(req, res, next);
    } else {
      return requireAdminOrAbove(req, res, next);
    }
  },
  rateLimitSensitiveOps,
  auditLog('delete_user'),
  deleteUser
);

/**
 * @route GET /api/users/:userId/activity
 * @desc Get user activity logs
 * @access Private (Admin or above)
 */
router.get('/:userId/activity', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  auditLog('view_user_activity'),
  getUserActivityLogs
);

/**
 * @route POST /api/users/bulk
 * @desc Perform bulk operations on users
 * @access Private (Admin or above)
 */
router.post('/bulk', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  rateLimitSensitiveOps,
  auditLog('bulk_user_operation'),
  bulkUserOperations
);

module.exports = router;