const User = require('../models/User');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendSMS } = require('../services/smsService');

/**
 * Get all users with pagination and filtering
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      verified,
      platform,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Apply filters
    if (status) query.status = status;
    if (verified !== undefined) query.isVerified = verified === 'true';
    if (platform) query.platform = platform;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(query)
      .select('-password -otp -otpExpiry')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Log admin activity
    await req.admin.logActivity('view_users', {
      filters: { status, verified, platform, search },
      pagination: { page, limit },
      resultsCount: users.length
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users'
    });
  }
};

/**
 * Get user by ID
 */
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password -otp -otpExpiry');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log admin activity
    await req.admin.logActivity('view_user_details', {
      targetUserId: userId,
      targetUserEmail: user.email
    });

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user'
    });
  }
};

/**
 * Update user status
 */
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body;

    const validStatuses = ['active', 'suspended', 'banned', 'pending'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const oldStatus = user.status;
    user.status = status;
    user.statusUpdatedBy = req.admin._id;
    user.statusUpdatedAt = new Date();
    
    if (reason) {
      user.statusReason = reason;
    }

    await user.save();

    // Log admin activity
    await req.admin.logActivity('update_user_status', {
      targetUserId: userId,
      targetUserEmail: user.email,
      oldStatus,
      newStatus: status,
      reason
    });

    // Send notification to user if status changed to suspended or banned
    if (['suspended', 'banned'].includes(status)) {
      try {
        await sendSMS(user.phone, 
          `Your account has been ${status}. ${reason ? 'Reason: ' + reason : ''} Contact support for assistance.`
        );
      } catch (smsError) {
        console.error('Failed to send status notification SMS:', smsError);
      }
    }

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          status: user.status,
          statusUpdatedAt: user.statusUpdatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
};

/**
 * Verify user manually
 */
const verifyUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'User is already verified'
      });
    }

    user.isVerified = true;
    user.verifiedAt = new Date();
    user.verifiedBy = req.admin._id;
    user.verificationMethod = 'admin_manual';
    
    if (reason) {
      user.verificationReason = reason;
    }

    await user.save();

    // Log admin activity
    await req.admin.logActivity('verify_user', {
      targetUserId: userId,
      targetUserEmail: user.email,
      reason
    });

    // Send confirmation SMS
    try {
      await sendSMS(user.phone, 
        'Your account has been verified by our admin team. You can now access all features.'
      );
    } catch (smsError) {
      console.error('Failed to send verification SMS:', smsError);
    }

    res.json({
      success: true,
      message: 'User verified successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          isVerified: user.isVerified,
          verifiedAt: user.verifiedAt
        }
      }
    });
  } catch (error) {
    console.error('Verify user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify user'
    });
  }
};

/**
 * Reset user password
 */
const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword, sendNotification = true } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.passwordResetBy = req.admin._id;
    user.passwordResetAt = new Date();

    await user.save();

    // Log admin activity
    await req.admin.logActivity('reset_user_password', {
      targetUserId: userId,
      targetUserEmail: user.email
    });

    // Send notification SMS
    if (sendNotification) {
      try {
        await sendSMS(user.phone, 
          'Your password has been reset by an administrator. Please log in with your new password and change it immediately for security.'
        );
      } catch (smsError) {
        console.error('Failed to send password reset SMS:', smsError);
      }
    }

    res.json({
      success: true,
      message: 'User password reset successfully'
    });
  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset user password'
    });
  }
};

/**
 * Delete user account
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, hardDelete = false } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (hardDelete) {
      // Permanently delete user
      await User.findByIdAndDelete(userId);
      
      // Log admin activity
      await req.admin.logActivity('hard_delete_user', {
        targetUserId: userId,
        targetUserEmail: user.email,
        reason
      });

      res.json({
        success: true,
        message: 'User permanently deleted'
      });
    } else {
      // Soft delete - mark as deleted
      user.isDeleted = true;
      user.deletedAt = new Date();
      user.deletedBy = req.admin._id;
      user.status = 'deleted';
      
      if (reason) {
        user.deletionReason = reason;
      }

      await user.save();

      // Log admin activity
      await req.admin.logActivity('soft_delete_user', {
        targetUserId: userId,
        targetUserEmail: user.email,
        reason
      });

      res.json({
        success: true,
        message: 'User account deactivated'
      });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

/**
 * Get user activity logs
 */
const getUserActivityLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const skip = (page - 1) * limit;
    
    // Get user's activity logs (assuming we store them)
    const activities = user.activityLogs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(skip, skip + parseInt(limit));

    const total = user.activityLogs.length;
    const totalPages = Math.ceil(total / limit);

    // Log admin activity
    await req.admin.logActivity('view_user_activity', {
      targetUserId: userId,
      targetUserEmail: user.email
    });

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalActivities: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get user activity logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user activity logs'
    });
  }
};

/**
 * Bulk user operations
 */
const bulkUserOperations = async (req, res) => {
  try {
    const { operation, userIds, data } = req.body;

    if (!operation || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        message: 'Operation and userIds array are required'
      });
    }

    const validOperations = ['updateStatus', 'verify', 'delete'];
    if (!validOperations.includes(operation)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid operation. Must be one of: ' + validOperations.join(', ')
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          results.failed.push({ userId, reason: 'User not found' });
          continue;
        }

        switch (operation) {
          case 'updateStatus':
            if (data.status) {
              user.status = data.status;
              user.statusUpdatedBy = req.admin._id;
              user.statusUpdatedAt = new Date();
              if (data.reason) user.statusReason = data.reason;
              await user.save();
            }
            break;

          case 'verify':
            if (!user.isVerified) {
              user.isVerified = true;
              user.verifiedAt = new Date();
              user.verifiedBy = req.admin._id;
              user.verificationMethod = 'admin_bulk';
              await user.save();
            }
            break;

          case 'delete':
            user.isDeleted = true;
            user.deletedAt = new Date();
            user.deletedBy = req.admin._id;
            user.status = 'deleted';
            if (data.reason) user.deletionReason = data.reason;
            await user.save();
            break;
        }

        results.successful.push({ userId, email: user.email });
      } catch (error) {
        results.failed.push({ userId, reason: error.message });
      }
    }

    // Log admin activity
    await req.admin.logActivity('bulk_user_operation', {
      operation,
      totalUsers: userIds.length,
      successful: results.successful.length,
      failed: results.failed.length,
      data
    });

    res.json({
      success: true,
      message: `Bulk ${operation} completed`,
      data: results
    });
  } catch (error) {
    console.error('Bulk user operations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk operation'
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUserStatus,
  verifyUser,
  resetUserPassword,
  deleteUser,
  getUserActivityLogs,
  bulkUserOperations
};