const UnitLeader = require('../models/UnitLeader');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { sendSMS } = require('../services/smsService');

/**
 * Assign user to unit
 */
const assignUserToUnit = async (req, res) => {
  try {
    const { userId, unitId, role = 'member', notes } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate unit exists
    const unit = await UnitLeader.findById(unitId);
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    // Check if user is already in this unit
    const existingMember = unit.members.find(member => 
      member.userId.toString() === userId
    );

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this unit'
      });
    }

    // Add user to unit
    await unit.addMember(userId, role, notes);

    // Send SMS notification to user
    try {
      await sendSMS(user.phoneNumber, 
        `You have been assigned to ${unit.unitName} as ${role}. Welcome to the unit!`
      );
    } catch (smsError) {
      console.error('Assignment SMS error:', smsError);
    }

    // Log admin activity
    await req.admin.logActivity('assign_user_to_unit', {
      userId,
      userEmail: user.email,
      unitId,
      unitName: unit.unitName,
      role,
      notes
    });

    res.json({
      success: true,
      message: 'User assigned to unit successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        unit: {
          _id: unit._id,
          unitName: unit.unitName,
          unitType: unit.unitType
        },
        role
      }
    });
  } catch (error) {
    console.error('Assign user to unit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign user to unit'
    });
  }
};

/**
 * Transfer user between units
 */
const transferUserBetweenUnits = async (req, res) => {
  try {
    const { userId, fromUnitId, toUnitId, newRole, reason, notes } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate units exist
    const fromUnit = await UnitLeader.findById(fromUnitId);
    const toUnit = await UnitLeader.findById(toUnitId);

    if (!fromUnit) {
      return res.status(404).json({
        success: false,
        message: 'Source unit not found'
      });
    }

    if (!toUnit) {
      return res.status(404).json({
        success: false,
        message: 'Destination unit not found'
      });
    }

    // Check if user is in source unit
    const memberInFromUnit = fromUnit.members.find(member => 
      member.userId.toString() === userId
    );

    if (!memberInFromUnit) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of the source unit'
      });
    }

    // Check if user is already in destination unit
    const memberInToUnit = toUnit.members.find(member => 
      member.userId.toString() === userId
    );

    if (memberInToUnit) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of the destination unit'
      });
    }

    // Remove from source unit
    await fromUnit.removeMember(userId);

    // Add to destination unit
    await toUnit.addMember(userId, newRole || memberInFromUnit.role, notes);

    // Send SMS notification
    try {
      await sendSMS(user.phoneNumber, 
        `You have been transferred from ${fromUnit.unitName} to ${toUnit.unitName}. ${reason ? `Reason: ${reason}` : ''}`
      );
    } catch (smsError) {
      console.error('Transfer SMS error:', smsError);
    }

    // Log admin activity
    await req.admin.logActivity('transfer_user_between_units', {
      userId,
      userEmail: user.email,
      fromUnitId,
      fromUnitName: fromUnit.unitName,
      toUnitId,
      toUnitName: toUnit.unitName,
      oldRole: memberInFromUnit.role,
      newRole: newRole || memberInFromUnit.role,
      reason,
      notes
    });

    res.json({
      success: true,
      message: 'User transferred successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        fromUnit: {
          _id: fromUnit._id,
          unitName: fromUnit.unitName
        },
        toUnit: {
          _id: toUnit._id,
          unitName: toUnit.unitName
        },
        newRole: newRole || memberInFromUnit.role
      }
    });
  } catch (error) {
    console.error('Transfer user between units error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transfer user between units'
    });
  }
};

/**
 * Remove user from unit
 */
const removeUserFromUnit = async (req, res) => {
  try {
    const { userId, unitId, reason } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate unit exists
    const unit = await UnitLeader.findById(unitId);
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    // Check if user is in unit
    const memberInUnit = unit.members.find(member => 
      member.userId.toString() === userId
    );

    if (!memberInUnit) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this unit'
      });
    }

    // Remove user from unit
    await unit.removeMember(userId);

    // Send SMS notification
    try {
      await sendSMS(user.phoneNumber, 
        `You have been removed from ${unit.unitName}. ${reason ? `Reason: ${reason}` : ''}`
      );
    } catch (smsError) {
      console.error('Removal SMS error:', smsError);
    }

    // Log admin activity
    await req.admin.logActivity('remove_user_from_unit', {
      userId,
      userEmail: user.email,
      unitId,
      unitName: unit.unitName,
      previousRole: memberInUnit.role,
      reason
    });

    res.json({
      success: true,
      message: 'User removed from unit successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        unit: {
          _id: unit._id,
          unitName: unit.unitName
        },
        reason
      }
    });
  } catch (error) {
    console.error('Remove user from unit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove user from unit'
    });
  }
};

/**
 * Get user's unit assignments
 */
const getUserUnitAssignments = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find all units where user is a member
    const units = await UnitLeader.find({
      'members.userId': userId
    })
    .populate('parentUnit', 'unitName unitType')
    .populate('reportsTo', 'name email unitName')
    .select('unitName unitType unitDescription leadershipRole members parentUnit reportsTo status')
    .lean();

    // Extract user's role in each unit
    const assignments = units.map(unit => {
      const member = unit.members.find(m => m.userId.toString() === userId);
      return {
        unit: {
          _id: unit._id,
          unitName: unit.unitName,
          unitType: unit.unitType,
          unitDescription: unit.unitDescription,
          leadershipRole: unit.leadershipRole,
          parentUnit: unit.parentUnit,
          reportsTo: unit.reportsTo,
          status: unit.status
        },
        role: member.role,
        joinedDate: member.joinedDate,
        notes: member.notes
      };
    });

    // Log admin activity
    await req.admin.logActivity('view_user_unit_assignments', {
      userId,
      userEmail: user.email,
      assignmentCount: assignments.length
    });

    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        assignments,
        totalAssignments: assignments.length
      }
    });
  } catch (error) {
    console.error('Get user unit assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user unit assignments'
    });
  }
};

/**
 * Get unit members
 */
const getUnitMembers = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { page = 1, limit = 20, role, status } = req.query;

    const skip = (page - 1) * limit;

    // Validate unit exists
    const unit = await UnitLeader.findById(unitId)
      .populate({
        path: 'members.userId',
        select: 'name email phoneNumber status profilePicture',
        match: status ? { status } : {}
      })
      .lean();

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    // Filter members by role if specified
    let members = unit.members.filter(member => member.userId); // Remove null populated members
    
    if (role) {
      members = members.filter(member => member.role === role);
    }

    // Apply pagination
    const total = members.length;
    const paginatedMembers = members.slice(skip, skip + parseInt(limit));
    const totalPages = Math.ceil(total / limit);

    // Log admin activity
    await req.admin.logActivity('view_unit_members', {
      unitId,
      unitName: unit.unitName,
      memberCount: total,
      filters: { role, status }
    });

    res.json({
      success: true,
      data: {
        unit: {
          _id: unit._id,
          unitName: unit.unitName,
          unitType: unit.unitType,
          leadershipRole: unit.leadershipRole
        },
        members: paginatedMembers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalMembers: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get unit members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve unit members'
    });
  }
};

/**
 * Bulk assign users to unit
 */
const bulkAssignUsersToUnit = async (req, res) => {
  try {
    const { userIds, unitId, role = 'member', notes } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    if (userIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 users can be assigned at once'
      });
    }

    // Validate unit exists
    const unit = await UnitLeader.findById(unitId);
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    const results = {
      assigned: [],
      failed: [],
      skipped: [],
      total: userIds.length
    };

    for (const userId of userIds) {
      try {
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
          results.failed.push({
            userId,
            error: 'User not found'
          });
          continue;
        }

        // Check if user is already in unit
        const existingMember = unit.members.find(member => 
          member.userId.toString() === userId
        );

        if (existingMember) {
          results.skipped.push({
            userId,
            userEmail: user.email,
            reason: 'Already a member'
          });
          continue;
        }

        // Add user to unit
        await unit.addMember(userId, role, notes);
        
        results.assigned.push({
          userId,
          userEmail: user.email,
          role
        });

        // Send SMS notification
        try {
          await sendSMS(user.phoneNumber, 
            `You have been assigned to ${unit.unitName} as ${role}. Welcome to the unit!`
          );
        } catch (smsError) {
          console.error(`SMS error for user ${userId}:`, smsError);
        }
      } catch (error) {
        results.failed.push({
          userId,
          error: error.message
        });
      }
    }

    // Log admin activity
    await req.admin.logActivity('bulk_assign_users_to_unit', {
      unitId,
      unitName: unit.unitName,
      totalAttempted: results.total,
      assignedCount: results.assigned.length,
      failedCount: results.failed.length,
      skippedCount: results.skipped.length,
      role
    });

    res.json({
      success: true,
      message: `Bulk assignment completed. ${results.assigned.length} assigned, ${results.failed.length} failed, ${results.skipped.length} skipped.`,
      data: results
    });
  } catch (error) {
    console.error('Bulk assign users to unit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk assign users to unit'
    });
  }
};

/**
 * Update unit hierarchy
 */
const updateUnitHierarchy = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { parentUnitId, reportsToId } = req.body;

    // Validate unit exists
    const unit = await UnitLeader.findById(unitId);
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    // Validate parent unit if provided
    let parentUnit = null;
    if (parentUnitId) {
      parentUnit = await UnitLeader.findById(parentUnitId);
      if (!parentUnit) {
        return res.status(404).json({
          success: false,
          message: 'Parent unit not found'
        });
      }

      // Prevent circular hierarchy
      if (parentUnitId === unitId) {
        return res.status(400).json({
          success: false,
          message: 'Unit cannot be its own parent'
        });
      }
    }

    // Validate reports to if provided
    let reportsTo = null;
    if (reportsToId) {
      reportsTo = await UnitLeader.findById(reportsToId);
      if (!reportsTo) {
        return res.status(404).json({
          success: false,
          message: 'Reports to unit not found'
        });
      }

      // Prevent self-reporting
      if (reportsToId === unitId) {
        return res.status(400).json({
          success: false,
          message: 'Unit cannot report to itself'
        });
      }
    }

    // Update hierarchy
    const oldParentUnit = unit.parentUnit;
    const oldReportsTo = unit.reportsTo;

    unit.parentUnit = parentUnitId || null;
    unit.reportsTo = reportsToId || null;
    unit.lastModifiedBy = req.admin._id;
    await unit.save();

    // Log admin activity
    await req.admin.logActivity('update_unit_hierarchy', {
      unitId,
      unitName: unit.unitName,
      oldParentUnit,
      newParentUnit: parentUnitId,
      oldReportsTo,
      newReportsTo: reportsToId
    });

    // Return updated unit with populated fields
    const updatedUnit = await UnitLeader.findById(unitId)
      .populate('parentUnit', 'unitName unitType')
      .populate('reportsTo', 'name email unitName')
      .select('-password');

    res.json({
      success: true,
      message: 'Unit hierarchy updated successfully',
      data: {
        unit: updatedUnit
      }
    });
  } catch (error) {
    console.error('Update unit hierarchy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update unit hierarchy'
    });
  }
};

module.exports = {
  assignUserToUnit,
  transferUserBetweenUnits,
  removeUserFromUnit,
  getUserUnitAssignments,
  getUnitMembers,
  bulkAssignUsersToUnit,
  updateUnitHierarchy
};