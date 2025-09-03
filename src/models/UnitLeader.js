const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AuditLog = require('./AuditLog');

const unitLeaderSchema = new mongoose.Schema({
  // Personal Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  
  // Authentication
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  // Unit Leadership Information
  unitType: {
    type: String,
    required: true,
    enum: [
      'youth_ministry',
      'children_ministry',
      'worship_team',
      'prayer_group',
      'bible_study',
      'outreach_ministry',
      'women_ministry',
      'men_ministry',
      'seniors_ministry',
      'small_group',
      'choir',
      'ushering_team',
      'technical_team',
      'hospitality_team',
      'counseling_ministry',
      'missions_team',
      'discipleship_group',
      'evangelism_team',
      'community_service',
      'other'
    ]
  },
  
  unitName: {
    type: String,
    required: true,
    trim: true
  },
  
  unitDescription: {
    type: String,
    trim: true
  },
  
  leadershipRole: {
    type: String,
    required: true,
    enum: [
      'unit_leader',
      'assistant_leader',
      'coordinator',
      'secretary',
      'treasurer',
      'team_member',
      'mentor',
      'facilitator'
    ],
    default: 'unit_leader'
  },
  
  // Hierarchy and Reporting
  parentUnit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UnitLeader',
    default: null
  },
  
  reportsTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UnitLeader',
    default: null
  },
  
  // Permissions and Access
  permissions: {
    canManageMembers: {
      type: Boolean,
      default: true
    },
    canScheduleEvents: {
      type: Boolean,
      default: true
    },
    canAccessReports: {
      type: Boolean,
      default: true
    },
    canManageFinances: {
      type: Boolean,
      default: false
    },
    canSendNotifications: {
      type: Boolean,
      default: true
    },
    canViewAllUnits: {
      type: Boolean,
      default: false
    }
  },
  
  // Unit Members Management
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['member', 'volunteer', 'assistant', 'coordinator'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on_leave'],
      default: 'active'
    }
  }],
  
  // Schedule and Meetings
  meetingSchedule: {
    frequency: {
      type: String,
      enum: ['weekly', 'bi_weekly', 'monthly', 'quarterly', 'as_needed'],
      default: 'weekly'
    },
    dayOfWeek: {
      type: String,
      enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    },
    time: {
      type: String // Format: "HH:MM"
    },
    location: {
      type: String,
      trim: true
    }
  },
  
  // Contact and Communication
  contactInfo: {
    alternatePhone: {
      type: String,
      trim: true
    },
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: {
        type: String,
        default: 'USA'
      }
    }
  },
  
  // Status and Activity
  status: {
    type: String,
    enum: ['active', 'inactive', 'on_leave', 'suspended'],
    default: 'active'
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  lastLogin: {
    type: Date
  },
  
  // Appointment and Term
  appointmentDate: {
    type: Date,
    default: Date.now
  },
  
  termEndDate: {
    type: Date
  },
  
  // Performance and Notes
  performanceNotes: [{
    note: {
      type: String,
      required: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['commendation', 'concern', 'training_needed', 'general'],
      default: 'general'
    }
  }],
  
  // Training and Qualifications
  training: [{
    title: {
      type: String,
      required: true
    },
    completedAt: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date
    },
    certificateUrl: {
      type: String
    }
  }],
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes for performance
unitLeaderSchema.index({ email: 1 });
unitLeaderSchema.index({ phoneNumber: 1 });
unitLeaderSchema.index({ employeeId: 1 });
unitLeaderSchema.index({ unitType: 1, status: 1 });
unitLeaderSchema.index({ parentUnit: 1 });
unitLeaderSchema.index({ reportsTo: 1 });
unitLeaderSchema.index({ status: 1, isVerified: 1 });
unitLeaderSchema.index({ 'members.userId': 1 });

// Pre-save middleware to hash password
unitLeaderSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance Methods
unitLeaderSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

unitLeaderSchema.methods.addMember = function(userId, role = 'member') {
  const existingMember = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (existingMember) {
    throw new Error('User is already a member of this unit');
  }
  
  this.members.push({
    userId,
    role,
    joinedAt: new Date(),
    status: 'active'
  });
  
  return this.save();
};

unitLeaderSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(member => 
    member.userId.toString() !== userId.toString()
  );
  
  return this.save();
};

unitLeaderSchema.methods.updateMemberRole = function(userId, newRole) {
  const member = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (!member) {
    throw new Error('User is not a member of this unit');
  }
  
  member.role = newRole;
  return this.save();
};

unitLeaderSchema.methods.updateMemberStatus = function(userId, newStatus) {
  const member = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (!member) {
    throw new Error('User is not a member of this unit');
  }
  
  member.status = newStatus;
  return this.save();
};

unitLeaderSchema.methods.addPerformanceNote = function(note, addedBy, type = 'general') {
  this.performanceNotes.push({
    note,
    addedBy,
    addedAt: new Date(),
    type
  });
  
  return this.save();
};

unitLeaderSchema.methods.addTraining = function(title, completedAt, expiresAt = null, certificateUrl = null) {
  this.training.push({
    title,
    completedAt,
    expiresAt,
    certificateUrl
  });
  
  return this.save();
};

unitLeaderSchema.methods.getActiveMembers = function() {
  return this.members.filter(member => member.status === 'active');
};

unitLeaderSchema.methods.getMemberCount = function() {
  return this.getActiveMembers().length;
};

unitLeaderSchema.methods.logActivity = async function(action, details = {}, req = null) {
  try {
    await AuditLog.logAction({
      action,
      actionCategory: 'unit_leader_management',
      actorId: this._id,
      actorType: 'unit_leader',
      actorEmail: this.email,
      targetId: details.targetId || this._id,
      targetType: details.targetType || 'unit_leader',
      targetEmail: details.targetEmail || this.email,
      details: {
        unitType: this.unitType,
        unitName: this.unitName,
        leadershipRole: this.leadershipRole,
        ...details
      },
      ipAddress: req?.ip,
      userAgent: req?.get('User-Agent'),
      success: details.success !== false
    });
  } catch (error) {
    console.error('Unit leader activity logging error:', error);
  }
};

// Static Methods
unitLeaderSchema.statics.findByUnitType = function(unitType, status = 'active') {
  return this.find({ unitType, status })
    .populate('parentUnit', 'unitName unitType')
    .populate('reportsTo', 'name email unitName')
    .populate('members.userId', 'name email phoneNumber')
    .sort({ unitName: 1 });
};

unitLeaderSchema.statics.findByHierarchy = function(parentUnitId) {
  return this.find({ parentUnit: parentUnitId })
    .populate('parentUnit', 'unitName unitType')
    .populate('reportsTo', 'name email unitName')
    .sort({ unitName: 1 });
};

unitLeaderSchema.statics.getUnitHierarchy = async function() {
  const units = await this.find({ status: 'active' })
    .populate('parentUnit', 'unitName unitType')
    .populate('reportsTo', 'name email unitName')
    .sort({ unitType: 1, unitName: 1 });
  
  // Build hierarchy tree
  const hierarchy = [];
  const unitMap = new Map();
  
  // First pass: create map of all units
  units.forEach(unit => {
    unitMap.set(unit._id.toString(), {
      ...unit.toObject(),
      children: []
    });
  });
  
  // Second pass: build hierarchy
  units.forEach(unit => {
    if (unit.parentUnit) {
      const parent = unitMap.get(unit.parentUnit._id.toString());
      if (parent) {
        parent.children.push(unitMap.get(unit._id.toString()));
      }
    } else {
      hierarchy.push(unitMap.get(unit._id.toString()));
    }
  });
  
  return hierarchy;
};

unitLeaderSchema.statics.getUnitStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$unitType',
        totalUnits: { $sum: 1 },
        activeUnits: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        totalMembers: { $sum: { $size: '$members' } },
        activeMembers: {
          $sum: {
            $size: {
              $filter: {
                input: '$members',
                cond: { $eq: ['$$this.status', 'active'] }
              }
            }
          }
        }
      }
    },
    {
      $sort: { totalUnits: -1 }
    }
  ]);
  
  const overallStats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUnits: { $sum: 1 },
        activeUnits: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        verifiedLeaders: {
          $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] }
        },
        totalMembers: { $sum: { $size: '$members' } }
      }
    }
  ]);
  
  return {
    byUnitType: stats,
    overall: overallStats[0] || {
      totalUnits: 0,
      activeUnits: 0,
      verifiedLeaders: 0,
      totalMembers: 0
    }
  };
};

unitLeaderSchema.statics.searchUnits = function(searchTerm, filters = {}) {
  const query = {
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { unitName: { $regex: searchTerm, $options: 'i' } },
      { email: { $regex: searchTerm, $options: 'i' } },
      { employeeId: { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  // Apply additional filters
  if (filters.unitType) query.unitType = filters.unitType;
  if (filters.status) query.status = filters.status;
  if (filters.leadershipRole) query.leadershipRole = filters.leadershipRole;
  if (filters.isVerified !== undefined) query.isVerified = filters.isVerified;
  
  return this.find(query)
    .populate('parentUnit', 'unitName unitType')
    .populate('reportsTo', 'name email unitName')
    .sort({ unitName: 1 })
    .limit(50);
};

module.exports = mongoose.model('UnitLeader', unitLeaderSchema);