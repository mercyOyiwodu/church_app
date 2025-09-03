const UnitLeader = require('../models/UnitLeader');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { sendSMS } = require('../services/smsService');
const bcrypt = require('bcryptjs');

/**
 * Get all unit leaders with filtering and pagination
 */
const getAllUnitLeaders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      unitType,
      status,
      leadershipRole,
      isVerified,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    let query = {};

    // Apply filters
    if (unitType) query.unitType = unitType;
    if (status) query.status = status;
    if (leadershipRole) query.leadershipRole = leadershipRole;
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { unitName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const unitLeaders = await UnitLeader.find(query)
      .populate('parentUnit', 'unitName unitType')
      .populate('reportsTo', 'name email unitName')
      .populate('createdBy', 'name email')
      .populate('members.userId', 'name email phoneNumber')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password')
      .lean();

    const total = await UnitLeader.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get summary statistics
    const stats = await UnitLeader.getUnitStats();

    // Log admin activity
    await req.admin.logActivity('view_unit_leaders', {
      filters: { unitType, status, leadershipRole, isVerified, search },
      pagination: { page, limit },
      resultsCount: unitLeaders.length
    });

    res.json({
      success: true,
      data: {
        unitLeaders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalLeaders: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        stats
      }
    });
  } catch (error) {
    console.error('Get all unit leaders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve unit leaders'
    });
  }
};

/**
 * Get unit leader by ID
 */
const getUnitLeaderById = async (req, res) => {
  try {
    const { leaderId } = req.params;

    const unitLeader = await UnitLeader.findById(leaderId)
      .populate('parentUnit', 'unitName unitType leadershipRole')
      .populate('reportsTo', 'name email unitName')
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .populate('members.userId', 'name email phoneNumber status')
      .populate('performanceNotes.addedBy', 'name email')
      .select('-password')
      .lean();

    if (!unitLeader) {
      return res.status(404).json({
        success: false,
        message: 'Unit leader not found'
      });
    }

    // Log admin activity
    await req.admin.logActivity('view_unit_leader_details', {
      targetId: leaderId,
      targetEmail: unitLeader.email,
      unitName: unitLeader.unitName
    });

    res.json({
      success: true,
      data: { unitLeader }
    });
  } catch (error) {
    console.error('Get unit leader by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve unit leader'
    });
  }
};

/**
 * Create new unit leader
 */
const createUnitLeader = async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      employeeId,
      password,
      unitType,
      unitName,
      unitDescription,
      leadershipRole,
      parentUnit,
      reportsTo,
      permissions,
      meetingSchedule,
      contactInfo,
      appointmentDate,
      termEndDate
    } = req.body;

    // Check if email or phone already exists
    const existingLeader = await UnitLeader.findOne({
      $or: [
        { email: email.toLowerCase() },
        { phoneNumber }
      ]
    });

    if (existingLeader) {
      return res.status(400).json({
        success: false,
        message: 'Unit leader with this email or phone number already exists'
      });
    }

    // Check if employeeId exists (if provided)
    if (employeeId) {
      const existingEmployeeId = await UnitLeader.findOne({ employeeId });
      if (existingEmployeeId) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID already exists'
        });
      }
    }

    // Validate parent unit and reporting structure
    if (parentUnit) {
      const parent = await UnitLeader.findById(parentUnit);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: 'Parent unit not found'
        });
      }
    }

    if (reportsTo) {
      const supervisor = await UnitLeader.findById(reportsTo);
      if (!supervisor) {
        return res.status(400).json({
          success: false,
          message: 'Supervisor not found'
        });
      }
    }

    // Create unit leader
    const unitLeader = new UnitLeader({
      name,
      email: email.toLowerCase(),
      phoneNumber,
      employeeId,
      password,
      unitType,
      unitName,
      unitDescription,
      leadershipRole,
      parentUnit,
      reportsTo,
      permissions: {
        canManageMembers: true,
        canScheduleEvents: true,
        canAccessReports: true,
        canManageFinances: false,
        canSendNotifications: true,
        canViewAllUnits: false,
        ...permissions
      },
      meetingSchedule,
      contactInfo,
      appointmentDate: appointmentDate || new Date(),
      termEndDate,
      createdBy: req.admin._id,
      status: 'active'
    });

    await unitLeader.save();

    // Send welcome SMS
    try {
      await sendSMS(phoneNumber, 
        `Welcome to ${unitName}! You have been appointed as ${leadershipRole}. Your login email is ${email}. Please check your email for further instructions.`
      );
    } catch (smsError) {
      console.error('Welcome SMS error:', smsError);
    }

    // Log admin activity
    await req.admin.logActivity('create_unit_leader', {
      targetId: unitLeader._id,
      targetEmail: unitLeader.email,
      unitName: unitLeader.unitName,
      unitType: unitLeader.unitType,
      leadershipRole: unitLeader.leadershipRole
    });

    // Return unit leader without password
    const createdLeader = await UnitLeader.findById(unitLeader._id)
      .populate('parentUnit', 'unitName unitType')
      .populate('reportsTo', 'name email unitName')
      .select('-password');

    res.status(201).json({
      success: true,
      message: 'Unit leader created successfully',
      data: { unitLeader: createdLeader }
    });
  } catch (error) {
    console.error('Create unit leader error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create unit leader'
    });
  }
};

/**
 * Update unit leader
 */
const updateUnitLeader = async (req, res) => {
  try {
    const { leaderId } = req.params;
    const updateData = req.body;

    const unitLeader = await UnitLeader.findById(leaderId);
    if (!unitLeader) {
      return res.status(404).json({
        success: false,
        message: 'Unit leader not found'
      });
    }

    // Check for email/phone conflicts if being updated
    if (updateData.email || updateData.phoneNumber) {
      const conflictQuery = {
        _id: { $ne: leaderId },
        $or: []
      };

      if (updateData.email) {
        conflictQuery.$or.push({ email: updateData.email.toLowerCase() });
      }
      if (updateData.phoneNumber) {
        conflictQuery.$or.push({ phoneNumber: updateData.phoneNumber });
      }

      const existingLeader = await UnitLeader.findOne(conflictQuery);
      if (existingLeader) {
        return res.status(400).json({
          success: false,
          message: 'Another unit leader with this email or phone number already exists'
        });
      }
    }

    // Check employeeId conflict
    if (updateData.employeeId) {
      const existingEmployeeId = await UnitLeader.findOne({
        _id: { $ne: leaderId },
        employeeId: updateData.employeeId
      });
      if (existingEmployeeId) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID already exists'
        });
      }
    }

    // Validate parent unit and reporting structure
    if (updateData.parentUnit) {
      const parent = await UnitLeader.findById(updateData.parentUnit);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: 'Parent unit not found'
        });
      }
    }

    if (updateData.reportsTo) {
      const supervisor = await UnitLeader.findById(updateData.reportsTo);
      if (!supervisor) {
        return res.status(400).json({
          success: false,
          message: 'Supervisor not found'
        });
      }
    }

    // Handle password update
    if (updateData.password) {
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (key !== '_id' && key !== 'createdBy' && key !== 'createdAt') {
        unitLeader[key] = updateData[key];
      }
    });

    unitLeader.lastModifiedBy = req.admin._id;
    await unitLeader.save();

    // Log admin activity
    await req.admin.logActivity('update_unit_leader', {
      targetId: leaderId,
      targetEmail: unitLeader.email,
      unitName: unitLeader.unitName,
      updatedFields: Object.keys(updateData)
    });

    // Return updated unit leader without password
    const updatedLeader = await UnitLeader.findById(leaderId)
      .populate('parentUnit', 'unitName unitType')
      .populate('reportsTo', 'name email unitName')
      .select('-password');

    res.json({
      success: true,
      message: 'Unit leader updated successfully',
      data: { unitLeader: updatedLeader }
    });
  } catch (error) {
    console.error('Update unit leader error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update unit leader'
    });
  }
};

/**
 * Update unit leader status
 */
const updateUnitLeaderStatus = async (req, res) => {
  try {
    const { leaderId } = req.params;
    const { status, reason } = req.body;

    if (!['active', 'inactive', 'on_leave', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const unitLeader = await UnitLeader.findById(leaderId);
    if (!unitLeader) {
      return res.status(404).json({
        success: false,
        message: 'Unit leader not found'
      });
    }

    const oldStatus = unitLeader.status;
    unitLeader.status = status;
    unitLeader.lastModifiedBy = req.admin._id;
    await unitLeader.save();

    // Send SMS notification for status change
    try {
      const statusMessages = {
        active: 'Your unit leadership status has been activated.',
        inactive: 'Your unit leadership status has been set to inactive.',
        on_leave: 'Your unit leadership status has been set to on leave.',
        suspended: 'Your unit leadership has been suspended. Please contact administration.'
      };

      await sendSMS(unitLeader.phoneNumber, 
        `${statusMessages[status]} ${reason ? `Reason: ${reason}` : ''}`
      );
    } catch (smsError) {
      console.error('Status change SMS error:', smsError);
    }

    // Log admin activity
    await req.admin.logActivity('update_unit_leader_status', {
      targetId: leaderId,
      targetEmail: unitLeader.email,
      unitName: unitLeader.unitName,
      oldStatus,
      newStatus: status,
      reason
    });

    res.json({
      success: true,
      message: 'Unit leader status updated successfully',
      data: {
        unitLeader: {
          _id: unitLeader._id,
          name: unitLeader.name,
          email: unitLeader.email,
          unitName: unitLeader.unitName,
          status: unitLeader.status
        }
      }
    });
  } catch (error) {
    console.error('Update unit leader status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update unit leader status'
    });
  }
};

/**
 * Verify unit leader
 */
const verifyUnitLeader = async (req, res) => {
  try {
    const { leaderId } = req.params;
    const { verified = true } = req.body;

    const unitLeader = await UnitLeader.findById(leaderId);
    if (!unitLeader) {
      return res.status(404).json({
        success: false,
        message: 'Unit leader not found'
      });
    }

    unitLeader.isVerified = verified;
    unitLeader.lastModifiedBy = req.admin._id;
    await unitLeader.save();

    // Send SMS notification
    try {
      const message = verified 
        ? `Congratulations! Your unit leadership for ${unitLeader.unitName} has been verified.`
        : `Your unit leadership verification has been revoked. Please contact administration.`;
      
      await sendSMS(unitLeader.phoneNumber, message);
    } catch (smsError) {
      console.error('Verification SMS error:', smsError);
    }

    // Log admin activity
    await req.admin.logActivity('verify_unit_leader', {
      targetId: leaderId,
      targetEmail: unitLeader.email,
      unitName: unitLeader.unitName,
      verified
    });

    res.json({
      success: true,
      message: `Unit leader ${verified ? 'verified' : 'unverified'} successfully`,
      data: {
        unitLeader: {
          _id: unitLeader._id,
          name: unitLeader.name,
          email: unitLeader.email,
          unitName: unitLeader.unitName,
          isVerified: unitLeader.isVerified
        }
      }
    });
  } catch (error) {
    console.error('Verify unit leader error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify unit leader'
    });
  }
};

/**
 * Delete unit leader
 */
const deleteUnitLeader = async (req, res) => {
  try {
    const { leaderId } = req.params;
    const { transferMembersTo, deleteType = 'soft' } = req.body;

    const unitLeader = await UnitLeader.findById(leaderId);
    if (!unitLeader) {
      return res.status(404).json({
        success: false,
        message: 'Unit leader not found'
      });
    }

    // Check if there are members to transfer
    if (unitLeader.members.length > 0 && !transferMembersTo) {
      return res.status(400).json({
        success: false,
        message: 'Unit has members. Please specify where to transfer them or provide transferMembersTo unit ID'
      });
    }

    // Transfer members if specified
    if (transferMembersTo && unitLeader.members.length > 0) {
      const targetUnit = await UnitLeader.findById(transferMembersTo);
      if (!targetUnit) {
        return res.status(400).json({
          success: false,
          message: 'Target unit for member transfer not found'
        });
      }

      // Transfer members
      for (const member of unitLeader.members) {
        await targetUnit.addMember(member.userId, member.role);
      }
    }

    if (deleteType === 'hard') {
      // Hard delete - completely remove from database
      await UnitLeader.findByIdAndDelete(leaderId);
    } else {
      // Soft delete - mark as inactive
      unitLeader.status = 'inactive';
      unitLeader.lastModifiedBy = req.admin._id;
      await unitLeader.save();
    }

    // Log admin activity
    await req.admin.logActivity('delete_unit_leader', {
      targetId: leaderId,
      targetEmail: unitLeader.email,
      unitName: unitLeader.unitName,
      deleteType,
      transferredMembersTo: transferMembersTo,
      memberCount: unitLeader.members.length
    });

    res.json({
      success: true,
      message: `Unit leader ${deleteType === 'hard' ? 'deleted' : 'deactivated'} successfully`,
      data: {
        deletedLeader: {
          _id: unitLeader._id,
          name: unitLeader.name,
          email: unitLeader.email,
          unitName: unitLeader.unitName
        },
        transferredMembers: unitLeader.members.length
      }
    });
  } catch (error) {
    console.error('Delete unit leader error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete unit leader'
    });
  }
};

/**
 * Get unit hierarchy
 */
const getUnitHierarchy = async (req, res) => {
  try {
    const hierarchy = await UnitLeader.getUnitHierarchy();

    // Log admin activity
    await req.admin.logActivity('view_unit_hierarchy', {
      totalUnits: hierarchy.length
    });

    res.json({
      success: true,
      data: { hierarchy }
    });
  } catch (error) {
    console.error('Get unit hierarchy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve unit hierarchy'
    });
  }
};

/**
 * Get unit statistics
 */
const getUnitStats = async (req, res) => {
  try {
    const stats = await UnitLeader.getUnitStats();

    // Log admin activity
    await req.admin.logActivity('view_unit_stats', {});

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get unit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve unit statistics'
    });
  }
};

/**
 * Search unit leaders
 */
const searchUnitLeaders = async (req, res) => {
  try {
    const { q: searchTerm, ...filters } = req.query;

    if (!searchTerm || searchTerm.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters long'
      });
    }

    const results = await UnitLeader.searchUnits(searchTerm.trim(), filters);

    // Log admin activity
    await req.admin.logActivity('search_unit_leaders', {
      searchTerm,
      filters,
      resultsCount: results.length
    });

    res.json({
      success: true,
      data: {
        searchTerm,
        results,
        count: results.length
      }
    });
  } catch (error) {
    console.error('Search unit leaders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search unit leaders'
    });
  }
};

module.exports = {
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
};