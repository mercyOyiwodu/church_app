const express = require('express');
const router = express.Router();
const {
  getSuperAdminDashboard,
  getDashboardCharts,
  getSystemMetrics,
  getRecentActivities
} = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/auth');
const {
  requireAnyAdmin,
  requireAdminOrAbove,
  requireSuperAdmin,
  requirePermission,
  auditLog
} = require('../middleware/rbac');

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard data and analytics endpoints
 */

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
 * /api/dashboard/overview:
 *   get:
 *     summary: Get Super Admin Dashboard overview with comprehensive statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     mainStats:
 *                       type: object
 *                       properties:
 *                         totalMembers:
 *                           type: number
 *                           example: 1250
 *                         activeMembers:
 *                           type: number
 *                           example: 1100
 *                         verifiedMembers:
 *                           type: number
 *                           example: 950
 *                         newMembersThisMonth:
 *                           type: number
 *                           example: 45
 *                     unitLeaderStats:
 *                       type: object
 *                       properties:
 *                         totalUnitLeaders:
 *                           type: number
 *                           example: 25
 *                         activeUnitLeaders:
 *                           type: number
 *                           example: 23
 *                     adminStats:
 *                       type: object
 *                       properties:
 *                         totalAdmins:
 *                           type: number
 *                           example: 5
 *                         activeAdmins:
 *                           type: number
 *                           example: 4
 *                     recentActivities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           user:
 *                             type: string
 *                     quickActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           action:
 *                             type: string
 *                           icon:
 *                             type: string
 *                     systemHealth:
 *                       type: object
 *                       properties:
 *                         database:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                             responseTime:
 *                               type: number
 *                         memory:
 *                           type: object
 *                           properties:
 *                             usage:
 *                               type: number
 *                             total:
 *                               type: number
 *                         authentication:
 *                           type: object
 *                           properties:
 *                             successRate:
 *                               type: number
 *                         api:
 *                           type: object
 *                           properties:
 *                             averageResponseTime:
 *                               type: number
 *                     growthMetrics:
 *                       type: object
 *                       properties:
 *                         memberGrowthRate:
 *                           type: number
 *                         retentionRate:
 *                           type: number
 *                         engagementScore:
 *                           type: number
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 */
router.get('/overview', 
  authenticateToken, 
  requireAdmin, 
  requireAnyAdmin, 
  auditLog('super_admin_dashboard'),
  getSuperAdminDashboard
);

/**
 * @swagger
 * /api/dashboard/charts:
 *   get:
 *     summary: Get dashboard charts data for visualization
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard charts data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     memberRegistrationTrend:
 *                       type: object
 *                       properties:
 *                         labels:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
 *                         data:
 *                           type: array
 *                           items:
 *                             type: number
 *                           example: [45, 52, 38, 67, 73, 89]
 *                     memberStatusDistribution:
 *                       type: object
 *                       properties:
 *                         labels:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["Active", "Inactive", "Pending"]
 *                         data:
 *                           type: array
 *                           items:
 *                             type: number
 *                           example: [850, 200, 100]
 *                     unitLeaderDistribution:
 *                       type: object
 *                       properties:
 *                         labels:
 *                           type: array
 *                           items:
 *                             type: string
 *                         data:
 *                           type: array
 *                           items:
 *                             type: number
 *                     adminActivityTrend:
 *                       type: object
 *                       properties:
 *                         labels:
 *                           type: array
 *                           items:
 *                             type: string
 *                         data:
 *                           type: array
 *                           items:
 *                             type: number
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 */
router.get('/charts', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  auditLog('dashboard_charts'),
  getDashboardCharts
);

/**
 * @route GET /api/dashboard/system/metrics
 * @desc Get system performance metrics
 * @access Private (Super Admin only)
 */
router.get('/system/metrics', 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin, 
  auditLog('system_metrics'),
  getSystemMetrics
);

/**
 * @route GET /api/dashboard/activities
 * @desc Get recent system activities
 * @access Private (Admin or above)
 */
router.get('/activities', 
  authenticateToken, 
  requireAdmin, 
  requireAdminOrAbove, 
  auditLog('recent_activities'),
  getRecentActivities
);

module.exports = router;