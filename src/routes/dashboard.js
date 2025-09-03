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
 * @route GET /api/dashboard/overview
 * @desc Get Super Admin Dashboard overview with comprehensive statistics
 * @access Private (Any Admin)
 */
router.get('/overview', 
  authenticateToken, 
  requireAdmin, 
  requireAnyAdmin, 
  auditLog('super_admin_dashboard'),
  getSuperAdminDashboard
);

/**
 * @route GET /api/dashboard/charts
 * @desc Get dashboard charts data for visualization
 * @access Private (Admin or above)
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