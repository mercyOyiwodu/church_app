const express = require('express');
const router = express.Router();
const {
  getAllUnitLeaders,
  getUnitLeaderById,
  createUnitLeader,
  updateUnitLeader,
  updateUnitLeaderStatus,
  verifyUnitLeader,
  deleteUnitLeader,
  getUnitHierarchy,
  getUnitStats,
  searchUnitLeaders
} = require('../controllers/unitLeaderController');
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
 * @route GET /api/unit-leaders
 * @desc Get all unit leaders with filtering and pagination
 * @access Admin+
 */
router.get('/', 
  requireAnyAdmin,
  auditLog('view_unit_leaders'),
  getAllUnitLeaders
);

/**
 * @route GET /api/unit-leaders/search
 * @desc Search unit leaders
 * @access Admin+
 */
router.get('/search',
  requireAnyAdmin,
  auditLog('search_unit_leaders'),
  searchUnitLeaders
);

/**
 * @route GET /api/unit-leaders/hierarchy
 * @desc Get unit hierarchy structure
 * @access Admin+
 */
router.get('/hierarchy',
  requireAnyAdmin,
  auditLog('view_unit_hierarchy'),
  getUnitHierarchy
);

/**
 * @route GET /api/unit-leaders/stats
 * @desc Get unit statistics
 * @access Admin+
 */
router.get('/stats',
  requireAnyAdmin,
  auditLog('view_unit_stats'),
  getUnitStats
);

/**
 * @route GET /api/unit-leaders/:leaderId
 * @desc Get unit leader by ID
 * @access Admin+
 */
router.get('/:leaderId',
  requireAnyAdmin,
  auditLog('view_unit_leader_details'),
  getUnitLeaderById
);

/**
 * @route POST /api/unit-leaders
 * @desc Create new unit leader
 * @access Admin+
 */
router.post('/',
  requireAdminOrAbove,
  requirePermission('manage_unit_leaders'),
  auditLog('create_unit_leader'),
  rateLimitSensitiveOps,
  createUnitLeader
);

/**
 * @route PUT /api/unit-leaders/:leaderId
 * @desc Update unit leader
 * @access Admin+
 */
router.put('/:leaderId',
  requireAdminOrAbove,
  requirePermission('manage_unit_leaders'),
  auditLog('update_unit_leader'),
  rateLimitSensitiveOps,
  updateUnitLeader
);

/**
 * @route PATCH /api/unit-leaders/:leaderId/status
 * @desc Update unit leader status
 * @access Admin+
 */
router.patch('/:leaderId/status',
  requireAdminOrAbove,
  requirePermission('manage_unit_leaders'),
  auditLog('update_unit_leader_status'),
  rateLimitSensitiveOps,
  updateUnitLeaderStatus
);

/**
 * @route PATCH /api/unit-leaders/:leaderId/verify
 * @desc Verify/unverify unit leader
 * @access Super Admin
 */
router.patch('/:leaderId/verify',
  requireSuperAdmin,
  auditLog('verify_unit_leader'),
  rateLimitSensitiveOps,
  verifyUnitLeader
);

/**
 * @route DELETE /api/unit-leaders/:leaderId
 * @desc Delete unit leader (soft or hard delete)
 * @access Super Admin
 */
router.delete('/:leaderId',
  requireSuperAdmin,
  auditLog('delete_unit_leader'),
  rateLimitSensitiveOps,
  deleteUnitLeader
);

// Unit member management routes

/**
 * @route POST /api/unit-leaders/:leaderId/members
 * @desc Add member to unit
 * @access Admin+
 */
router.post('/:leaderId/members',
  requireAdminOrAbove,
  requirePermission('manage_unit_members'),
  auditLog('add_unit_member'),
  async (req, res) => {
    try {
      const { leaderId } = req.params;
      const { userId, role = 'member' } = req.body;

      const unitLeader = await require('../models/UnitLeader').findById(leaderId);
      if (!unitLeader) {
        return res.status(404).json({
          success: false,
          message: 'Unit leader not found'
        });
      }

      // Check if user exists
      const user = await require('../models/User').findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Add member to unit
      await unitLeader.addMember(userId, role);

      // Log admin activity
      await req.admin.logActivity('add_unit_member', {
        unitId: leaderId,
        unitName: unitLeader.unitName,
        memberId: userId,
        memberEmail: user.email,
        role
      });

      res.json({
        success: true,
        message: 'Member added to unit successfully',
        data: {
          unitId: leaderId,
          memberId: userId,
          role
        }
      });
    } catch (error) {
      console.error('Add unit member error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add member to unit'
      });
    }
  }
);

/**
 * @route DELETE /api/unit-leaders/:leaderId/members/:userId
 * @desc Remove member from unit
 * @access Admin+
 */
router.delete('/:leaderId/members/:userId',
  requireAdminOrAbove,
  requirePermission('manage_unit_members'),
  auditLog('remove_unit_member'),
  async (req, res) => {
    try {
      const { leaderId, userId } = req.params;

      const unitLeader = await require('../models/UnitLeader').findById(leaderId);
      if (!unitLeader) {
        return res.status(404).json({
          success: false,
          message: 'Unit leader not found'
        });
      }

      // Remove member from unit
      await unitLeader.removeMember(userId);

      // Log admin activity
      await req.admin.logActivity('remove_unit_member', {
        unitId: leaderId,
        unitName: unitLeader.unitName,
        memberId: userId
      });

      res.json({
        success: true,
        message: 'Member removed from unit successfully',
        data: {
          unitId: leaderId,
          memberId: userId
        }
      });
    } catch (error) {
      console.error('Remove unit member error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove member from unit'
      });
    }
  }
);

/**
 * @route PUT /api/unit-leaders/:leaderId/members/:userId
 * @desc Update member role in unit
 * @access Admin+
 */
router.put('/:leaderId/members/:userId',
  requireAdminOrAbove,
  requirePermission('manage_unit_members'),
  auditLog('update_unit_member'),
  async (req, res) => {
    try {
      const { leaderId, userId } = req.params;
      const { role, notes } = req.body;

      const unitLeader = await require('../models/UnitLeader').findById(leaderId);
      if (!unitLeader) {
        return res.status(404).json({
          success: false,
          message: 'Unit leader not found'
        });
      }

      // Update member in unit
      await unitLeader.updateMember(userId, { role, notes });

      // Log admin activity
      await req.admin.logActivity('update_unit_member', {
        unitId: leaderId,
        unitName: unitLeader.unitName,
        memberId: userId,
        newRole: role,
        notes
      });

      res.json({
        success: true,
        message: 'Member updated successfully',
        data: {
          unitId: leaderId,
          memberId: userId,
          role
        }
      });
    } catch (error) {
      console.error('Update unit member error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update member'
      });
    }
  }
);

// Performance and training routes

/**
 * @route POST /api/unit-leaders/:leaderId/performance
 * @desc Add performance note
 * @access Admin+
 */
router.post('/:leaderId/performance',
  requireAdminOrAbove,
  auditLog('add_performance_note'),
  async (req, res) => {
    try {
      const { leaderId } = req.params;
      const { note, rating, category } = req.body;

      const unitLeader = await require('../models/UnitLeader').findById(leaderId);
      if (!unitLeader) {
        return res.status(404).json({
          success: false,
          message: 'Unit leader not found'
        });
      }

      // Add performance note
      await unitLeader.addPerformanceNote(note, rating, category, req.admin._id);

      // Log admin activity
      await req.admin.logActivity('add_performance_note', {
        targetId: leaderId,
        targetEmail: unitLeader.email,
        unitName: unitLeader.unitName,
        rating,
        category
      });

      res.json({
        success: true,
        message: 'Performance note added successfully'
      });
    } catch (error) {
      console.error('Add performance note error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add performance note'
      });
    }
  }
);

/**
 * @route POST /api/unit-leaders/:leaderId/training
 * @desc Add training record
 * @access Admin+
 */
router.post('/:leaderId/training',
  requireAdminOrAbove,
  auditLog('add_training_record'),
  async (req, res) => {
    try {
      const { leaderId } = req.params;
      const { title, description, completedDate, certificateUrl, provider } = req.body;

      const unitLeader = await require('../models/UnitLeader').findById(leaderId);
      if (!unitLeader) {
        return res.status(404).json({
          success: false,
          message: 'Unit leader not found'
        });
      }

      // Add training record
      await unitLeader.addTraining({
        title,
        description,
        completedDate: completedDate || new Date(),
        certificateUrl,
        provider,
        addedBy: req.admin._id
      });

      // Log admin activity
      await req.admin.logActivity('add_training_record', {
        targetId: leaderId,
        targetEmail: unitLeader.email,
        unitName: unitLeader.unitName,
        trainingTitle: title,
        provider
      });

      res.json({
        success: true,
        message: 'Training record added successfully'
      });
    } catch (error) {
      console.error('Add training record error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add training record'
      });
    }
  }
);

// Bulk operations

/**
 * @route POST /api/unit-leaders/bulk/create
 * @desc Bulk create unit leaders
 * @access Super Admin
 */
router.post('/bulk/create',
  requireSuperAdmin,
  auditLog('bulk_create_unit_leaders'),
  rateLimitSensitiveOps,
  async (req, res) => {
    try {
      const { unitLeaders } = req.body;

      if (!Array.isArray(unitLeaders) || unitLeaders.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Unit leaders array is required'
        });
      }

      if (unitLeaders.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 50 unit leaders can be created at once'
        });
      }

      const results = {
        created: [],
        failed: [],
        total: unitLeaders.length
      };

      for (const leaderData of unitLeaders) {
        try {
          // Add created by admin
          leaderData.createdBy = req.admin._id;
          
          const unitLeader = new (require('../models/UnitLeader'))(leaderData);
          await unitLeader.save();
          
          results.created.push({
            email: leaderData.email,
            unitName: leaderData.unitName,
            id: unitLeader._id
          });
        } catch (error) {
          results.failed.push({
            email: leaderData.email,
            unitName: leaderData.unitName,
            error: error.message
          });
        }
      }

      // Log admin activity
      await req.admin.logActivity('bulk_create_unit_leaders', {
        totalAttempted: results.total,
        successCount: results.created.length,
        failedCount: results.failed.length
      });

      res.json({
        success: true,
        message: `Bulk creation completed. ${results.created.length} created, ${results.failed.length} failed.`,
        data: results
      });
    } catch (error) {
      console.error('Bulk create unit leaders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk create unit leaders'
      });
    }
  }
);

/**
 * @route POST /api/unit-leaders/bulk/update-status
 * @desc Bulk update unit leader status
 * @access Super Admin
 */
router.post('/bulk/update-status',
  requireSuperAdmin,
  auditLog('bulk_update_unit_leader_status'),
  rateLimitSensitiveOps,
  async (req, res) => {
    try {
      const { leaderIds, status, reason } = req.body;

      if (!Array.isArray(leaderIds) || leaderIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Leader IDs array is required'
        });
      }

      if (!['active', 'inactive', 'on_leave', 'suspended'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status value'
        });
      }

      const results = await require('../models/UnitLeader').updateMany(
        { _id: { $in: leaderIds } },
        { 
          status,
          lastModifiedBy: req.admin._id
        }
      );

      // Log admin activity
      await req.admin.logActivity('bulk_update_unit_leader_status', {
        leaderIds,
        newStatus: status,
        reason,
        updatedCount: results.modifiedCount
      });

      res.json({
        success: true,
        message: `${results.modifiedCount} unit leaders updated successfully`,
        data: {
          updatedCount: results.modifiedCount,
          status,
          reason
        }
      });
    } catch (error) {
      console.error('Bulk update status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk update status'
      });
    }
  }
);

module.exports = router;