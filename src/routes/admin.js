const express = require('express');
const router = express.Router();
const {
  registerAdmin,
  loginAdmin,
  verifyAdminOTP,
  getAdminProfile,
  updateAdminProfile,
  changePassword,
  getAllAdmins,
  updateAdminStatus,
  deleteAdmin
} = require('../controllers/adminController');
const { authenticateToken, requireVerified } = require('../middleware/auth');

// Middleware to check if user is admin
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

// Middleware to check if user is super admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const Admin = require('../models/Admin');
    const admin = await Admin.findById(req.admin.id);
    
    if (!admin || admin.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Super admin access required'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Public routes (no authentication required)

/**
 * @route POST /api/admin/login
 * @desc Admin login with email/phone and password
 * @access Public
 */
router.post('/login', loginAdmin);

/**
 * @route POST /api/admin/verify-otp
 * @desc Verify admin OTP after registration
 * @access Public
 */
router.post('/verify-otp', verifyAdminOTP);

// Protected routes (authentication required)

/**
 * @route GET /api/admin/profile
 * @desc Get admin profile
 * @access Private (Admin only)
 */
router.get('/profile', authenticateToken, requireAdmin, getAdminProfile);

/**
 * @route PUT /api/admin/profile
 * @desc Update admin profile
 * @access Private (Admin only)
 */
router.put('/profile', authenticateToken, requireAdmin, updateAdminProfile);

/**
 * @route PUT /api/admin/change-password
 * @desc Change admin password
 * @access Private (Admin only)
 */
router.put('/change-password', authenticateToken, requireAdmin, changePassword);

// Super Admin only routes

/**
 * @route POST /api/admin/register
 * @desc Register a new admin (Super Admin only)
 * @access Private (Super Admin only)
 */
router.post('/register', authenticateToken, requireAdmin, requireSuperAdmin, registerAdmin);

/**
 * @route GET /api/admin/all
 * @desc Get all admins with pagination and filters (Super Admin only)
 * @access Private (Super Admin only)
 */
router.get('/all', authenticateToken, requireAdmin, requireSuperAdmin, getAllAdmins);

/**
 * @route PUT /api/admin/:adminId/status
 * @desc Update admin status (Super Admin only)
 * @access Private (Super Admin only)
 */
router.put('/:adminId/status', authenticateToken, requireAdmin, requireSuperAdmin, updateAdminStatus);

/**
 * @route DELETE /api/admin/:adminId
 * @desc Delete admin (Super Admin only)
 * @access Private (Super Admin only)
 */
router.delete('/:adminId', authenticateToken, requireAdmin, requireSuperAdmin, deleteAdmin);

module.exports = router;