const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User Management
 *   description: User management operations for administrators
 */
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
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users with pagination and filtering
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of users per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended, banned, pending]
 *         description: Filter by user status
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *         description: Filter by verification status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone number
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Users retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalUsers:
 *                           type: integer
 *                         hasNext:
 *                           type: boolean
 *                         hasPrev:
 *                           type: boolean
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', 
  authenticateToken, 
  requireAdmin, 
  requireAnyAdmin, 
  auditLog('view_all_users'),
  getAllUsers
);

/**
 * @swagger
 * /api/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to retrieve
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:userId', 
  authenticateToken, 
  requireAdmin, 
  requireAnyAdmin, 
  auditLog('view_user_details'),
  getUserById
);

/**
 * @swagger
 * /api/users/{userId}/status:
 *   put:
 *     summary: Update user status (active, suspended, banned, pending)
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to update status
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended, banned, pending]
 *                 example: "active"
 *               reason:
 *                 type: string
 *                 description: Reason for status change (required for suspension/ban)
 *                 example: "Policy violation"
 *               duration:
 *                 type: integer
 *                 description: Duration in days for temporary suspension
 *                 example: 30
 *     responses:
 *       200:
 *         description: User status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User status updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request - validation errors
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 * @swagger
 * /api/users/{userId}/verify:
 *   put:
 *     summary: Manually verify a user
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to verify
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Admin notes for manual verification
 *                 example: "Verified through phone call"
 *     responses:
 *       200:
 *         description: User verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User verified successfully
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request - user already verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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