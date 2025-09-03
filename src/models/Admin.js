const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[+]?[1-9]\d{1,14}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  
  // Authentication
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  
  // Role and Permissions
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator'],
    default: 'admin',
    required: true
  },
  permissions: {
    users: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: true },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    },
    admins: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    },
    system: {
      settings: { type: Boolean, default: false },
      logs: { type: Boolean, default: false },
      backup: { type: Boolean, default: false },
      maintenance: { type: Boolean, default: false }
    },
    content: {
      create: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      publish: { type: Boolean, default: false }
    }
  },
  
  // Verification and Status
  isVerified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'inactive'],
    default: 'pending'
  },
  
  // Biometric Authentication
  biometricEnabled: {
    type: Boolean,
    default: false
  },
  biometricData: {
    publicKey: String,
    keyId: String,
    lastUsed: Date
  },
  
  // OTP for admin verification
  otp: {
    code: {
      type: String,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null
    },
    attempts: {
      type: Number,
      default: 0
    },
    lastSentAt: {
      type: Date,
      default: null
    }
  },
  
  // Security
  lastLoginAt: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  passwordChangedAt: {
    type: Date,
    default: Date.now
  },
  
  // Device and Session Management
  deviceInfo: {
    deviceId: String,
    platform: String,
    appVersion: String,
    lastIpAddress: String
  },
  
  // Admin Specific
  department: {
    type: String,
    trim: true
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  // Audit Trail
  lastActivity: {
    type: Date,
    default: Date.now
  },
  activityLog: [{
    action: String,
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.otp;
      delete ret.biometricData;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
adminSchema.index({ email: 1 });
adminSchema.index({ phoneNumber: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ status: 1 });
adminSchema.index({ employeeId: 1 }, { sparse: true });

// Virtual for account lock status
adminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Set default permissions based on role
adminSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    this.setDefaultPermissions();
  }
  next();
});

// Methods
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

adminSchema.methods.setDefaultPermissions = function() {
  switch (this.role) {
    case 'super_admin':
      this.permissions = {
        users: { create: true, read: true, update: true, delete: true },
        admins: { create: true, read: true, update: true, delete: true },
        system: { settings: true, logs: true, backup: true, maintenance: true },
        content: { create: true, update: true, delete: true, publish: true }
      };
      break;
    case 'admin':
      this.permissions = {
        users: { create: true, read: true, update: true, delete: false },
        admins: { create: false, read: true, update: false, delete: false },
        system: { settings: false, logs: true, backup: false, maintenance: false },
        content: { create: true, update: true, delete: false, publish: true }
      };
      break;
    case 'moderator':
      this.permissions = {
        users: { create: false, read: true, update: false, delete: false },
        admins: { create: false, read: false, update: false, delete: false },
        system: { settings: false, logs: false, backup: false, maintenance: false },
        content: { create: true, update: true, delete: false, publish: false }
      };
      break;
  }
};

adminSchema.methods.hasPermission = function(resource, action) {
  return this.permissions[resource] && this.permissions[resource][action];
};

adminSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  this.otp = {
    code: otp,
    expiresAt: expiresAt,
    attempts: 0,
    lastSentAt: new Date()
  };
  
  return otp;
};

adminSchema.methods.verifyOTP = function(inputOTP) {
  if (!this.otp.code || !this.otp.expiresAt) {
    return { success: false, message: 'No OTP found' };
  }
  
  if (new Date() > this.otp.expiresAt) {
    return { success: false, message: 'OTP has expired' };
  }
  
  if (this.otp.attempts >= 3) {
    return { success: false, message: 'Too many failed attempts' };
  }
  
  if (this.otp.code !== inputOTP) {
    this.otp.attempts += 1;
    return { success: false, message: 'Invalid OTP' };
  }
  
  // OTP is valid
  this.isVerified = true;
  this.status = 'active';
  this.otp = {
    code: null,
    expiresAt: null,
    attempts: 0,
    lastSentAt: null
  };
  
  return { success: true, message: 'OTP verified successfully' };
};

adminSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // If we have hit max attempts and it's not locked, lock the account
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

adminSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

adminSchema.methods.logActivity = function(action, details = {}, req = null) {
  const logEntry = {
    action,
    timestamp: new Date(),
    details
  };
  
  if (req) {
    logEntry.ipAddress = req.ip || req.connection.remoteAddress;
    logEntry.userAgent = req.get('User-Agent');
  }
  
  this.activityLog.push(logEntry);
  this.lastActivity = new Date();
  
  // Keep only last 100 activities
  if (this.activityLog.length > 100) {
    this.activityLog = this.activityLog.slice(-100);
  }
  
  return this.save();
};

module.exports = mongoose.model('Admin', adminSchema);