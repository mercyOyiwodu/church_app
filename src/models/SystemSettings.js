const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  // General Settings
  appName: {
    type: String,
    default: 'Church Management System',
    required: true
  },
  appVersion: {
    type: String,
    default: '1.0.0'
  },
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'System is under maintenance. Please try again later.'
  },

  // Authentication Settings
  authSettings: {
    maxLoginAttempts: {
      type: Number,
      default: 5,
      min: 1,
      max: 10
    },
    lockoutDuration: {
      type: Number,
      default: 15, // minutes
      min: 1,
      max: 1440
    },
    otpExpiry: {
      type: Number,
      default: 10, // minutes
      min: 1,
      max: 60
    },
    sessionTimeout: {
      type: Number,
      default: 24, // hours
      min: 1,
      max: 168
    },
    requireEmailVerification: {
      type: Boolean,
      default: true
    },
    requirePhoneVerification: {
      type: Boolean,
      default: true
    },
    allowBiometricAuth: {
      type: Boolean,
      default: true
    },
    passwordMinLength: {
      type: Number,
      default: 6,
      min: 4,
      max: 20
    },
    passwordRequireSpecialChars: {
      type: Boolean,
      default: false
    }
  },

  // SMS Settings
  smsSettings: {
    provider: {
      type: String,
      enum: ['twilio', 'nexmo', 'aws-sns'],
      default: 'twilio'
    },
    enabled: {
      type: Boolean,
      default: true
    },
    rateLimitPerHour: {
      type: Number,
      default: 10,
      min: 1,
      max: 100
    },
    rateLimitPerDay: {
      type: Number,
      default: 50,
      min: 1,
      max: 1000
    }
  },

  // Email Settings
  emailSettings: {
    provider: {
      type: String,
      enum: ['smtp', 'sendgrid', 'mailgun', 'aws-ses'],
      default: 'smtp'
    },
    enabled: {
      type: Boolean,
      default: true
    },
    fromEmail: {
      type: String,
      default: 'noreply@church.com'
    },
    fromName: {
      type: String,
      default: 'Church Management'
    }
  },

  // Security Settings
  securitySettings: {
    enableRateLimiting: {
      type: Boolean,
      default: true
    },
    rateLimitWindowMs: {
      type: Number,
      default: 900000, // 15 minutes
      min: 60000,
      max: 3600000
    },
    rateLimitMaxRequests: {
      type: Number,
      default: 100,
      min: 10,
      max: 1000
    },
    enableIPWhitelist: {
      type: Boolean,
      default: false
    },
    whitelistedIPs: [{
      type: String
    }],
    enableBusinessHours: {
      type: Boolean,
      default: false
    },
    businessHours: {
      start: {
        type: String,
        default: '09:00'
      },
      end: {
        type: String,
        default: '17:00'
      },
      timezone: {
        type: String,
        default: 'UTC'
      },
      workDays: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      }]
    },
    enableAuditLogging: {
      type: Boolean,
      default: true
    },
    auditLogRetentionDays: {
      type: Number,
      default: 90,
      min: 1,
      max: 365
    }
  },

  // Database Settings
  databaseSettings: {
    enableBackup: {
      type: Boolean,
      default: true
    },
    backupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'daily'
    },
    backupRetentionDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365
    },
    enableCleanup: {
      type: Boolean,
      default: true
    },
    cleanupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly'
    }
  },

  // Notification Settings
  notificationSettings: {
    enablePushNotifications: {
      type: Boolean,
      default: true
    },
    enableEmailNotifications: {
      type: Boolean,
      default: true
    },
    enableSMSNotifications: {
      type: Boolean,
      default: true
    },
    adminNotificationEmail: {
      type: String,
      default: 'admin@church.com'
    },
    criticalAlertsPhone: {
      type: String
    }
  },

  // Feature Flags
  featureFlags: {
    enableUserRegistration: {
      type: Boolean,
      default: true
    },
    enableBiometricAuth: {
      type: Boolean,
      default: true
    },
    enableSocialLogin: {
      type: Boolean,
      default: false
    },
    enableMultiLanguage: {
      type: Boolean,
      default: false
    },
    enableDarkMode: {
      type: Boolean,
      default: true
    },
    enableAdvancedAnalytics: {
      type: Boolean,
      default: false
    }
  },

  // API Settings
  apiSettings: {
    enableAPIDocumentation: {
      type: Boolean,
      default: true
    },
    enableCORS: {
      type: Boolean,
      default: true
    },
    allowedOrigins: [{
      type: String,
      default: ['http://localhost:3000', 'https://church.com']
    }],
    apiVersion: {
      type: String,
      default: 'v1'
    },
    enableAPIKeys: {
      type: Boolean,
      default: false
    }
  },

  // Metadata
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  },
  version: {
    type: Number,
    default: 1
  },
  changeHistory: [{
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    changes: {
      type: mongoose.Schema.Types.Mixed
    },
    reason: String
  }]
}, {
  timestamps: true
});

// Pre-save middleware to track changes
systemSettingsSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.version += 1;
    this.lastUpdatedAt = new Date();
  }
  next();
});

// Static method to get current settings
systemSettingsSchema.statics.getCurrentSettings = async function() {
  let settings = await this.findOne().sort({ createdAt: -1 });
  
  if (!settings) {
    // Create default settings if none exist
    settings = new this({});
    await settings.save();
  }
  
  return settings;
};

// Method to update settings with change tracking
systemSettingsSchema.methods.updateSettings = async function(updates, adminId, reason) {
  const oldValues = {};
  const newValues = {};
  
  // Track what's being changed
  for (const key in updates) {
    if (this[key] !== updates[key]) {
      oldValues[key] = this[key];
      newValues[key] = updates[key];
      this[key] = updates[key];
    }
  }
  
  // Add to change history
  this.changeHistory.push({
    changedBy: adminId,
    changedAt: new Date(),
    changes: {
      old: oldValues,
      new: newValues
    },
    reason
  });
  
  this.lastUpdatedBy = adminId;
  
  return await this.save();
};

// Method to get specific setting category
systemSettingsSchema.methods.getCategory = function(category) {
  return this[category] || {};
};

// Method to validate setting values
systemSettingsSchema.methods.validateSettings = function() {
  const errors = [];
  
  // Validate auth settings
  if (this.authSettings.maxLoginAttempts < 1 || this.authSettings.maxLoginAttempts > 10) {
    errors.push('Max login attempts must be between 1 and 10');
  }
  
  if (this.authSettings.passwordMinLength < 4 || this.authSettings.passwordMinLength > 20) {
    errors.push('Password minimum length must be between 4 and 20');
  }
  
  // Validate email format
  if (this.emailSettings.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.emailSettings.fromEmail)) {
    errors.push('Invalid from email format');
  }
  
  // Validate business hours
  if (this.securitySettings.enableBusinessHours) {
    const startTime = this.securitySettings.businessHours.start;
    const endTime = this.securitySettings.businessHours.end;
    
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
      errors.push('Invalid business hours start time format (HH:MM)');
    }
    
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTime)) {
      errors.push('Invalid business hours end time format (HH:MM)');
    }
  }
  
  return errors;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);