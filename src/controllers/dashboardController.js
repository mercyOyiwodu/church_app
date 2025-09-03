const Admin = require('../models/Admin');
const User = require('../models/User');
const UnitLeader = require('../models/UnitLeader');
const mongoose = require('mongoose');

/**
 * Get Super Admin Dashboard Overview
 * Provides comprehensive statistics and metrics for the dashboard UI
 */
const getSuperAdminDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Main Statistics Cards
    const totalMembers = await User.countDocuments();
    const activeMembers = await User.countDocuments({ status: 'active' });
    const verifiedMembers = await User.countDocuments({ isVerified: true });
    const newMembersToday = await User.countDocuments({ createdAt: { $gte: startOfDay } });
    const newMembersThisWeek = await User.countDocuments({ createdAt: { $gte: startOfWeek } });
    const newMembersThisMonth = await User.countDocuments({ createdAt: { $gte: startOfMonth } });

    // Unit Leaders Statistics
    const totalUnitLeaders = await UnitLeader.countDocuments();
    const activeUnitLeaders = await UnitLeader.countDocuments({ status: 'active' });
    const pendingUnitLeaders = await UnitLeader.countDocuments({ status: 'pending' });

    // Admin Statistics
    const totalAdmins = await Admin.countDocuments();
    const activeAdmins = await Admin.countDocuments({ status: 'active' });
    const superAdmins = await Admin.countDocuments({ role: 'super_admin' });
    const systemAdmins = await Admin.countDocuments({ role: 'system_admin' });
    const contentAdmins = await Admin.countDocuments({ role: 'content_admin' });
    const userAdmins = await Admin.countDocuments({ role: 'user_admin' });

    // Recent Activities
    const recentActivities = await getRecentSystemActivities(20);

    // Quick Actions Data
    const quickActions = [
      {
        id: 'user_management',
        title: 'User Management',
        description: 'Manage church members',
        icon: 'users',
        count: totalMembers,
        route: '/admin/users'
      },
      {
        id: 'unit_leaders',
        title: 'Unit Leaders',
        description: 'Manage unit leadership',
        icon: 'crown',
        count: totalUnitLeaders,
        route: '/admin/unit-leaders'
      },
      {
        id: 'admin_management',
        title: 'Admin Management',
        description: 'Manage administrators',
        icon: 'shield',
        count: totalAdmins,
        route: '/admin/admins'
      },
      {
        id: 'system_settings',
        title: 'System Settings',
        description: 'Configure system',
        icon: 'settings',
        route: '/admin/settings'
      },
      {
        id: 'reports',
        title: 'Reports & Analytics',
        description: 'View detailed reports',
        icon: 'chart',
        route: '/admin/reports'
      },
      {
        id: 'notifications',
        title: 'Notifications',
        description: 'Send announcements',
        icon: 'bell',
        route: '/admin/notifications'
      }
    ];

    // System Health Metrics
    const systemHealth = {
      database: 'healthy',
      server: 'healthy',
      uptime: Math.floor(process.uptime()),
      memoryUsage: process.memoryUsage(),
      lastBackup: new Date()
    };

    // Growth Metrics
    const growthMetrics = {
      membersGrowthRate: calculateGrowthRate(newMembersThisMonth, newMembersToday),
      unitLeadersGrowthRate: 0, // Can be calculated based on historical data
      adminsGrowthRate: 0 // Can be calculated based on historical data
    };

    res.status(200).json({
      success: true,
      message: 'Super Admin Dashboard data retrieved successfully',
      data: {
        overview: {
          totalMembers,
          activeMembers,
          verifiedMembers,
          membershipRate: totalMembers > 0 ? ((verifiedMembers / totalMembers) * 100).toFixed(1) : 0,
          newMembersToday,
          newMembersThisWeek,
          newMembersThisMonth
        },
        unitLeaders: {
          total: totalUnitLeaders,
          active: activeUnitLeaders,
          pending: pendingUnitLeaders,
          activeRate: totalUnitLeaders > 0 ? ((activeUnitLeaders / totalUnitLeaders) * 100).toFixed(1) : 0
        },
        admins: {
          total: totalAdmins,
          active: activeAdmins,
          superAdmins,
          systemAdmins,
          contentAdmins,
          userAdmins,
          distribution: {
            super_admin: superAdmins,
            system_admin: systemAdmins,
            content_admin: contentAdmins,
            user_admin: userAdmins
          }
        },
        recentActivities,
        quickActions,
        systemHealth,
        growthMetrics,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Get Super Admin Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get Dashboard Statistics for Charts
 */
const getDashboardCharts = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Member Registration Trends
    const memberRegistrationTrends = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Member Status Distribution
    const memberStatusDistribution = await User.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Unit Leader Distribution by Type
    const unitLeaderDistribution = await UnitLeader.aggregate([
      {
        $group: {
          _id: '$unitType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Admin Activity Trends
    const adminActivityTrends = await Admin.aggregate([
      {
        $match: {
          lastLoginAt: { $gte: startDate, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$lastLoginAt' },
            month: { $month: '$lastLoginAt' },
            day: { $dayOfMonth: '$lastLoginAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'Dashboard charts data retrieved successfully',
      data: {
        period,
        memberRegistrationTrends: memberRegistrationTrends.map(item => ({
          date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
          count: item.count
        })),
        memberStatusDistribution,
        unitLeaderDistribution,
        adminActivityTrends: adminActivityTrends.map(item => ({
          date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
          count: item.count
        })),
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Get dashboard charts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get System Performance Metrics
 */
const getSystemMetrics = async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Database metrics
    const dbStats = await mongoose.connection.db.stats();
    
    // Memory usage
    const memoryUsage = process.memoryUsage();
    
    // Authentication metrics
    const authMetrics = {
      successfulLogins: await User.countDocuments({
        lastLoginAt: { $gte: startOfDay }
      }),
      adminLogins: await Admin.countDocuments({
        lastLoginAt: { $gte: startOfDay }
      }),
      biometricAuth: await Admin.countDocuments({
        'biometricData.lastUsed': { $gte: startOfDay }
      })
    };

    // API performance metrics
    const apiMetrics = {
      uptime: Math.floor(process.uptime()),
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      database: {
        collections: dbStats.collections,
        dataSize: Math.round(dbStats.dataSize / 1024 / 1024), // MB
        indexSize: Math.round(dbStats.indexSize / 1024 / 1024), // MB
        storageSize: Math.round(dbStats.storageSize / 1024 / 1024) // MB
      }
    };

    res.status(200).json({
      success: true,
      message: 'System metrics retrieved successfully',
      data: {
        authentication: authMetrics,
        performance: apiMetrics,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Get system metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get Recent Activities for Dashboard
 */
const getRecentActivities = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const activities = await getRecentSystemActivities(parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Recent activities retrieved successfully',
      data: {
        activities,
        total: activities.length,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Helper function to get recent system activities
 */
const getRecentSystemActivities = async (limit = 20) => {
  try {
    let activities = [];

    // Get recent user registrations
    const recentUsers = await User.find({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
    .select('firstName lastName phoneNumber createdAt isVerified')
    .sort({ createdAt: -1 })
    .limit(limit);

    const userActivities = recentUsers.map(user => ({
      type: 'user_registration',
      timestamp: user.createdAt,
      title: 'New Member Registration',
      description: `${user.firstName} ${user.lastName} joined the church`,
      icon: 'user-plus',
      metadata: {
        userId: user._id,
        phoneNumber: user.phoneNumber,
        verified: user.isVerified
      }
    }));

    activities = activities.concat(userActivities);

    // Get recent admin activities
    const recentAdminActivities = await Admin.aggregate([
      {
        $unwind: '$activityLog'
      },
      {
        $match: {
          'activityLog.timestamp': {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $sort: { 'activityLog.timestamp': -1 }
      },
      {
        $limit: limit
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          email: 1,
          role: 1,
          activity: '$activityLog'
        }
      }
    ]);

    const adminActivities = recentAdminActivities.map(item => ({
      type: 'admin_activity',
      timestamp: item.activity.timestamp,
      title: 'Admin Action',
      description: `${item.firstName} ${item.lastName} ${item.activity.action}`,
      icon: 'shield-check',
      metadata: {
        adminId: item._id,
        adminEmail: item.email,
        adminRole: item.role,
        action: item.activity.action,
        details: item.activity.details
      }
    }));

    activities = activities.concat(adminActivities);

    // Get recent unit leader activities
    const recentUnitLeaders = await UnitLeader.find({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
    .select('firstName lastName unitType unitName role createdAt')
    .sort({ createdAt: -1 })
    .limit(limit);

    const unitLeaderActivities = recentUnitLeaders.map(leader => ({
      type: 'unit_leader_assignment',
      timestamp: leader.createdAt,
      title: 'Unit Leader Assignment',
      description: `${leader.firstName} ${leader.lastName} assigned as ${leader.role} of ${leader.unitName}`,
      icon: 'crown',
      metadata: {
        leaderId: leader._id,
        unitType: leader.unitType,
        unitName: leader.unitName,
        role: leader.role
      }
    }));

    activities = activities.concat(unitLeaderActivities);

    // Sort all activities by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return activities.slice(0, limit);
  } catch (error) {
    console.error('Get recent system activities error:', error);
    return [];
  }
};

/**
 * Helper function to calculate growth rate
 */
const calculateGrowthRate = (currentPeriod, previousPeriod) => {
  if (previousPeriod === 0) return currentPeriod > 0 ? 100 : 0;
  return ((currentPeriod - previousPeriod) / previousPeriod * 100).toFixed(1);
};

module.exports = {
  getSuperAdminDashboard,
  getDashboardCharts,
  getSystemMetrics,
  getRecentActivities
};