const Admin = require('../models/Admin');
const { generateTokens } = require('../middleware/auth');
const smsService = require('../services/smsService');
const bcrypt = require('bcryptjs');

/**
 * Register a new admin (Super Admin only)
 */
const registerAdmin = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role,
      department,
      employeeId
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { phoneNumber }, { employeeId: employeeId || null }]
    });

    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: 'Admin with this email, phone number, or employee ID already exists'
      });
    }

    // Create new admin
    const admin = new Admin({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role: role || 'admin',
      department,
      employeeId,
      createdBy: req.admin.id,
      status: 'pending'
    });

    // Generate OTP for verification
    const otp = admin.generateOTP();
    await admin.save();

    // Send OTP via SMS
    try {
      await smsService.sendOTP(phoneNumber, otp);
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      // Continue with registration even if SMS fails
    }

    // Log activity
    const createdByAdmin = await Admin.findById(req.admin.id);
    await createdByAdmin.logActivity('admin_created', {
      newAdminId: admin._id,
      newAdminEmail: email,
      role: admin.role
    }, req);

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully. OTP sent for verification.',
      data: {
        adminId: admin._id,
        email: admin.email,
        phoneNumber: admin.phoneNumber,
        role: admin.role,
        status: admin.status,
        otpSent: true
      }
    });
  } catch (error) {
    console.error('Register admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Admin login with email/phone and password
 */
const loginAdmin = async (req, res) => {
  try {
    const { identifier, password, deviceInfo } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/phone and password are required'
      });
    }

    // Find admin by email or phone
    const admin = await Admin.findOne({
      $or: [{ email: identifier }, { phoneNumber: identifier }]
    }).select('+password');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
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
        message: 'Account is temporarily locked due to too many failed attempts'
      });
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      await admin.incrementLoginAttempts();
      await admin.logActivity('login_failed', {
        reason: 'invalid_password',
        identifier,
        deviceInfo
      }, req);

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Successful login
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

    await admin.logActivity('login_success', { deviceInfo }, req);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(admin._id, 'admin');

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        admin: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          phoneNumber: admin.phoneNumber,
          role: admin.role,
          permissions: admin.permissions,
          department: admin.department,
          lastLoginAt: admin.lastLoginAt,
          biometricEnabled: admin.biometricEnabled
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify admin OTP
 */
const verifyAdminOTP = async (req, res) => {
  try {
    const { adminId, otp } = req.body;

    if (!adminId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID and OTP are required'
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const verificationResult = admin.verifyOTP(otp);
    if (!verificationResult.success) {
      await admin.save();
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }

    await admin.save();
    await admin.logActivity('otp_verified', {}, req);

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully. Admin account is now active.',
      data: {
        adminId: admin._id,
        status: admin.status,
        isVerified: admin.isVerified
      }
    });
  } catch (error) {
    console.error('Verify admin OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get admin profile
 */
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Admin profile retrieved successfully',
      data: {
        admin: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          phoneNumber: admin.phoneNumber,
          role: admin.role,
          permissions: admin.permissions,
          department: admin.department,
          employeeId: admin.employeeId,
          status: admin.status,
          isVerified: admin.isVerified,
          biometricEnabled: admin.biometricEnabled,
          lastLoginAt: admin.lastLoginAt,
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update admin profile
 */
const updateAdminProfile = async (req, res) => {
  try {
    const { firstName, lastName, department } = req.body;
    const adminId = req.admin.id;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Update allowed fields
    if (firstName) admin.firstName = firstName;
    if (lastName) admin.lastName = lastName;
    if (department) admin.department = department;

    await admin.save();
    await admin.logActivity('profile_updated', {
      updatedFields: { firstName, lastName, department }
    }, req);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        admin: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          phoneNumber: admin.phoneNumber,
          role: admin.role,
          department: admin.department
        }
      }
    });
  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Change admin password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    const admin = await Admin.findById(adminId).select('+password');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();
    await admin.logActivity('password_changed', {}, req);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all admins (Super Admin only)
 */
const getAllAdmins = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, status, search } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const admins = await Admin.find(query)
      .select('-password -otp -biometricData')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Admin.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'Admins retrieved successfully',
      data: {
        admins,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update admin status (Super Admin only)
 */
const updateAdminStatus = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { status } = req.body;

    if (!['pending', 'active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Prevent super admin from being suspended by other admins
    if (admin.role === 'super_admin' && req.admin.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify super admin status'
      });
    }

    const oldStatus = admin.status;
    admin.status = status;
    await admin.save();

    // Log activity
    const updatedByAdmin = await Admin.findById(req.admin.id);
    await updatedByAdmin.logActivity('admin_status_updated', {
      targetAdminId: adminId,
      oldStatus,
      newStatus: status
    }, req);

    res.status(200).json({
      success: true,
      message: 'Admin status updated successfully',
      data: {
        adminId: admin._id,
        status: admin.status
      }
    });
  } catch (error) {
    console.error('Update admin status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete admin (Super Admin only)
 */
const deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Prevent deletion of super admin
    if (admin.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete super admin'
      });
    }

    // Prevent self-deletion
    if (admin._id.toString() === req.admin.id) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    await Admin.findByIdAndDelete(adminId);

    // Log activity
    const deletedByAdmin = await Admin.findById(req.admin.id);
    await deletedByAdmin.logActivity('admin_deleted', {
      deletedAdminId: adminId,
      deletedAdminEmail: admin.email
    }, req);

    res.status(200).json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  registerAdmin,
  loginAdmin,
  verifyAdminOTP,
  getAdminProfile,
  updateAdminProfile,
  changePassword,
  getAllAdmins,
  updateAdminStatus,
  deleteAdmin
};