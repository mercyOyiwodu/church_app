const express = require('express');
const router = express.Router();
const {
  assignUserToUnit,
  transferUserBetweenUnits,
  removeUserFromUnit,
  getUserUnitAssignments,
  getUnitMembers,
  bulkAssignUsersToUnit,
  updateUnitHierarchy
} = require('../controllers/unitAssignmentController');
const { authenticateToken } = require('../middleware/auth');
const {
  requireAdmin,
  requireAnyAdmin,
  requireAdminOrAbove,
  requireSuperAdmin,
  requirePermission,
  auditLog,
  rateLimitSensitiveOps
} = require('../middleware/rbac');

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @route POST /api/unit-assignments/assign
 * @desc Assign user to unit
 * @access Admin+
 */
router.post('/assign',
  requireAdminOrAbove,
  requirePermission('manage_unit_members'),
  auditLog('assign_user_to_unit'),
  rateLimitSensitiveOps,
  assignUserToUnit
);

/**
 * @route POST /api/unit-assignments/transfer
 * @desc Transfer user between units
 * @access Admin+
 */
router.post('/transfer',
  requireAdminOrAbove,
  requirePermission('manage_unit_members'),
  auditLog('transfer_user_between_units'),
  rateLimitSensitiveOps,
  transferUserBetweenUnits
);

/**
 * @route POST /api/unit-assignments/remove
 * @desc Remove user from unit
 * @access Admin+
 */
router.post('/remove',
  requireAdminOrAbove,
  requirePermission('manage_unit_members'),
  auditLog('remove_user_from_unit'),
  rateLimitSensitiveOps,
  removeUserFromUnit
);

/**
 * @route GET /api/unit-assignments/user/:userId
 * @desc Get user's unit assignments
 * @access Admin+
 */
router.get('/user/:userId',
  requireAnyAdmin,
  auditLog('view_user_unit_assignments'),
  getUserUnitAssignments
);

/**
 * @route GET /api/unit-assignments/unit/:unitId/members
 * @desc Get unit members
 * @access Admin+
 */
router.get('/unit/:unitId/members',
  requireAnyAdmin,
  auditLog('view_unit_members'),
  getUnitMembers
);

/**
 * @route POST /api/unit-assignments/bulk-assign
 * @desc Bulk assign users to unit
 * @access Admin+
 */
router.post('/bulk-assign',
  requireAdminOrAbove,
  requirePermission('manage_unit_members'),
  auditLog('bulk_assign_users_to_unit'),
  rateLimitSensitiveOps,
  bulkAssignUsersToUnit
);

/**
 * @route PUT /api/unit-assignments/hierarchy/:unitId
 * @desc Update unit hierarchy
 * @access Admin+
 */
router.put('/hierarchy/:unitId',
  requireAdminOrAbove,
  requirePermission('manage_unit_hierarchy'),
  auditLog('update_unit_hierarchy'),
  rateLimitSensitiveOps,
  updateUnitHierarchy
);

// Additional utility routes

/**
 * @route GET /api/unit-assignments/unassigned-users
 * @desc Get users not assigned to any unit
 * @access Admin+
 */
router.get('/unassigned-users',
  requireAnyAdmin,
  auditLog('view_unassigned_users'),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, search } = req.query;
      const skip = (page - 1) * limit;

      // Get all user IDs that are assigned to units
      const assignedUserIds = await require('../models/UnitLeader').distinct('members.userId');

      // Build query for unassigned users
      let query = {
        _id: { $nin: assignedUserIds },
        status: 'active'
      };

      // Add search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await require('../models/User').find(query)
        .select('name email phoneNumber status profilePicture createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await require('../models/User').countDocuments(query);
      const totalPages = Math.ceil(total / limit);

      // Log admin activity
      await req.admin.logActivity('view_unassigned_users', {
        search,
        resultsCount: users.length,
        totalUnassigned: total
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
      console.error('Get unassigned users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve unassigned users'
      });
    }
  }
);

/**
 * @route GET /api/unit-assignments/assignment-summary
 * @desc Get assignment summary statistics
 * @access Admin+
 */
router.get('/assignment-summary',
  requireAnyAdmin,
  auditLog('view_assignment_summary'),
  async (req, res) => {
    try {
      // Get total users
      const totalUsers = await require('../models/User').countDocuments({ status: 'active' });

      // Get assigned user IDs
      const assignedUserIds = await require('../models/UnitLeader').distinct('members.userId');
      const assignedCount = assignedUserIds.length;
      const unassignedCount = totalUsers - assignedCount;

      // Get unit statistics
      const unitStats = await require('../models/UnitLeader').aggregate([
        {
          $group: {
            _id: '$unitType',
            count: { $sum: 1 },
            totalMembers: { $sum: { $size: '$members' } },
            activeUnits: {
              $sum: {
                $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
              }
            }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Get role distribution
      const roleDistribution = await require('../models/UnitLeader').aggregate([
        { $unwind: '$members' },
        {
          $group: {
            _id: '$members.role',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      // Get recent assignments (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentAssignments = await require('../models/UnitLeader').aggregate([
        { $unwind: '$members' },
        {
          $match: {
            'members.joinedDate': { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$members.joinedDate'
              }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Log admin activity
      await req.admin.logActivity('view_assignment_summary', {
        totalUsers,
        assignedCount,
        unassignedCount
      });

      res.json({
        success: true,
        data: {
          overview: {
            totalUsers,
            assignedUsers: assignedCount,
            unassignedUsers: unassignedCount,
            assignmentRate: totalUsers > 0 ? ((assignedCount / totalUsers) * 100).toFixed(2) : 0
          },
          unitStats,
          roleDistribution,
          recentAssignments
        }
      });
    } catch (error) {
      console.error('Get assignment summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve assignment summary'
      });
    }
  }
);

/**
 * @route POST /api/unit-assignments/validate-hierarchy
 * @desc Validate unit hierarchy for circular dependencies
 * @access Admin+
 */
router.post('/validate-hierarchy',
  requireAnyAdmin,
  auditLog('validate_unit_hierarchy'),
  async (req, res) => {
    try {
      const { unitId, parentUnitId } = req.body;

      if (!unitId || !parentUnitId) {
        return res.status(400).json({
          success: false,
          message: 'Unit ID and Parent Unit ID are required'
        });
      }

      // Check if units exist
      const unit = await require('../models/UnitLeader').findById(unitId);
      const parentUnit = await require('../models/UnitLeader').findById(parentUnitId);

      if (!unit) {
        return res.status(404).json({
          success: false,
          message: 'Unit not found'
        });
      }

      if (!parentUnit) {
        return res.status(404).json({
          success: false,
          message: 'Parent unit not found'
        });
      }

      // Check for circular dependency
      const checkCircularDependency = async (currentUnitId, targetUnitId, visited = new Set()) => {
        if (visited.has(currentUnitId)) {
          return true; // Circular dependency found
        }

        if (currentUnitId === targetUnitId) {
          return true; // Direct circular dependency
        }

        visited.add(currentUnitId);

        const currentUnit = await require('../models/UnitLeader').findById(currentUnitId);
        if (currentUnit && currentUnit.parentUnit) {
          return await checkCircularDependency(currentUnit.parentUnit.toString(), targetUnitId, visited);
        }

        return false;
      };

      const hasCircularDependency = await checkCircularDependency(parentUnitId, unitId);

      // Log admin activity
      await req.admin.logActivity('validate_unit_hierarchy', {
        unitId,
        parentUnitId,
        hasCircularDependency
      });

      res.json({
        success: true,
        data: {
          isValid: !hasCircularDependency,
          hasCircularDependency,
          message: hasCircularDependency 
            ? 'Circular dependency detected. This hierarchy change is not allowed.'
            : 'Hierarchy change is valid.'
        }
      });
    } catch (error) {
      console.error('Validate hierarchy error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate hierarchy'
      });
    }
  }
);

module.exports = router;