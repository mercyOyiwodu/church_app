const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Action Information
  action: {
    type: String,
    required: true,
    index: true
  },
  actionCategory: {
    type: String,
    enum: [
      'authentication', 'user_management', 'admin_management', 
      'system_settings', 'dashboard', 'biometric', 'security',
      'data_export', 'data_import', 'backup', 'maintenance'
    ],
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },

  // Actor Information (who performed the action)
  actorType: {
    type: String,
    enum: ['admin', 'user', 'system'],
    required: true,
    index: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  actorEmail: {
    type: String,
    index: true
  },
  actorName: {
    type: String
  },
  actorRole: {
    type: String
  },
  actorIP: {
    type: String,
    index: true
  },
  actorUserAgent: {
    type: String
  },

  // Target Information (what was acted upon)
  targetType: {
    type: String,
    enum: ['user', 'admin', 'settings', 'system', 'data', 'session'],
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  targetEmail: {
    type: String,
    index: true
  },
  targetName: {
    type: String
  },

  // Action Details
  actionData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  oldValues: {
    type: mongoose.Schema.Types.Mixed
  },
  newValues: {
    type: mongoose.Schema.Types.Mixed
  },
  changes: {
    type: mongoose.Schema.Types.Mixed
  },

  // Result Information
  success: {
    type: Boolean,
    required: true,
    default: true,
    index: true
  },
  errorMessage: {
    type: String
  },
  errorCode: {
    type: String
  },

  // Context Information
  sessionId: {
    type: String,
    index: true
  },
  requestId: {
    type: String,
    index: true
  },
  correlationId: {
    type: String,
    index: true
  },

  // Risk Assessment
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true
  },
  sensitiveAction: {
    type: Boolean,
    default: false,
    index: true
  },

  // Compliance and Retention
  retentionCategory: {
    type: String,
    enum: ['standard', 'extended', 'permanent'],
    default: 'standard',
    index: true
  },
  complianceFlags: [{
    type: String,
    enum: ['gdpr', 'hipaa', 'sox', 'pci', 'custom']
  }],

  // Metadata
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  source: {
    type: String,
    enum: ['web', 'mobile', 'api', 'system', 'cli'],
    default: 'web'
  },
  version: {
    type: String,
    default: '1.0'
  },

  // Additional Security Context
  geolocation: {
    country: String,
    region: String,
    city: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  deviceInfo: {
    type: String
  },
  browserInfo: {
    type: String
  },

  // Flags for special handling
  flagged: {
    type: Boolean,
    default: false,
    index: true
  },
  flagReason: {
    type: String
  },
  reviewed: {
    type: Boolean,
    default: false,
    index: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String
  }
}, {
  timestamps: true,
  collection: 'audit_logs'
});

// Indexes for performance
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ actionCategory: 1, timestamp: -1 });
auditLogSchema.index({ success: 1, timestamp: -1 });
auditLogSchema.index({ riskLevel: 1, timestamp: -1 });
auditLogSchema.index({ sensitiveAction: 1, timestamp: -1 });
auditLogSchema.index({ flagged: 1, timestamp: -1 });
auditLogSchema.index({ actorIP: 1, timestamp: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });

// Compound indexes for common queries
auditLogSchema.index({ actorId: 1, actionCategory: 1, timestamp: -1 });
auditLogSchema.index({ targetId: 1, actionCategory: 1, timestamp: -1 });
auditLogSchema.index({ riskLevel: 1, sensitiveAction: 1, timestamp: -1 });

// Static methods
auditLogSchema.statics.logAction = async function(logData) {
  try {
    // Determine risk level based on action
    const riskLevel = this.determineRiskLevel(logData.action, logData.actionCategory);
    
    // Check if action is sensitive
    const sensitiveAction = this.isSensitiveAction(logData.action);
    
    const auditLog = new this({
      ...logData,
      riskLevel,
      sensitiveAction,
      timestamp: new Date()
    });
    
    await auditLog.save();
    
    // If high risk or sensitive, trigger alerts
    if (riskLevel === 'high' || riskLevel === 'critical' || sensitiveAction) {
      await this.triggerSecurityAlert(auditLog);
    }
    
    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error to avoid breaking the main operation
    return null;
  }
};

auditLogSchema.statics.determineRiskLevel = function(action, category) {
  const criticalActions = [
    'hard_delete_user', 'reset_all_settings', 'import_settings',
    'create_super_admin', 'delete_admin', 'system_shutdown'
  ];
  
  const highRiskActions = [
    'update_user_status', 'reset_user_password', 'delete_user',
    'update_admin_role', 'update_system_settings', 'bulk_user_operation'
  ];
  
  const mediumRiskActions = [
    'verify_user', 'create_admin', 'update_settings_category',
    'export_settings', 'view_system_settings'
  ];
  
  if (criticalActions.includes(action)) return 'critical';
  if (highRiskActions.includes(action)) return 'high';
  if (mediumRiskActions.includes(action)) return 'medium';
  
  return 'low';
};

auditLogSchema.statics.isSensitiveAction = function(action) {
  const sensitiveActions = [
    'reset_user_password', 'view_user_details', 'export_settings',
    'view_system_settings', 'update_system_settings', 'create_admin',
    'update_admin_role', 'delete_admin', 'bulk_user_operation'
  ];
  
  return sensitiveActions.includes(action);
};

auditLogSchema.statics.triggerSecurityAlert = async function(auditLog) {
  // This would integrate with your alerting system
  console.log(`SECURITY ALERT: ${auditLog.riskLevel.toUpperCase()} risk action detected:`, {
    action: auditLog.action,
    actor: auditLog.actorEmail,
    timestamp: auditLog.timestamp,
    ip: auditLog.actorIP
  });
  
  // You could send notifications, emails, or trigger other security measures here
};

auditLogSchema.statics.getActionsByActor = async function(actorId, options = {}) {
  const {
    startDate,
    endDate,
    actionCategory,
    riskLevel,
    page = 1,
    limit = 50
  } = options;
  
  const query = { actorId };
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  if (actionCategory) query.actionCategory = actionCategory;
  if (riskLevel) query.riskLevel = riskLevel;
  
  const skip = (page - 1) * limit;
  
  return await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

auditLogSchema.statics.getActionsByTarget = async function(targetId, targetType, options = {}) {
  const {
    startDate,
    endDate,
    actionCategory,
    page = 1,
    limit = 50
  } = options;
  
  const query = { targetId, targetType };
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  if (actionCategory) query.actionCategory = actionCategory;
  
  const skip = (page - 1) * limit;
  
  return await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

auditLogSchema.statics.getSecurityEvents = async function(options = {}) {
  const {
    riskLevel = ['high', 'critical'],
    flagged,
    startDate,
    endDate,
    page = 1,
    limit = 50
  } = options;
  
  const query = {};
  
  if (Array.isArray(riskLevel)) {
    query.riskLevel = { $in: riskLevel };
  } else {
    query.riskLevel = riskLevel;
  }
  
  if (flagged !== undefined) query.flagged = flagged;
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  
  return await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Instance methods
auditLogSchema.methods.flag = async function(reason, reviewerId) {
  this.flagged = true;
  this.flagReason = reason;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  return await this.save();
};

auditLogSchema.methods.review = async function(notes, reviewerId) {
  this.reviewed = true;
  this.reviewNotes = notes;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  return await this.save();
};

// Pre-save middleware for data validation and enrichment
auditLogSchema.pre('save', function(next) {
  // Ensure timestamp is set
  if (!this.timestamp) {
    this.timestamp = new Date();
  }
  
  // Set retention category based on risk level
  if (!this.retentionCategory) {
    if (this.riskLevel === 'critical') {
      this.retentionCategory = 'permanent';
    } else if (this.riskLevel === 'high' || this.sensitiveAction) {
      this.retentionCategory = 'extended';
    } else {
      this.retentionCategory = 'standard';
    }
  }
  
  next();
});

module.exports = mongoose.model('AuditLog', auditLogSchema);