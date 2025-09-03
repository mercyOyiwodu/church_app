const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        // Basic phone number validation (supports international format)
        return /^[+]?[1-9]\d{1,14}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
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
  profile: {
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(v) {
          return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Please enter a valid email address'
      }
    }
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended'],
    default: 'pending'
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  deviceInfo: {
    deviceId: String,
    platform: String,
    appVersion: String
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.otp;
      delete ret.__v;
      return ret;
    }
  }
});

// Index for phone number lookup
userSchema.index({ phoneNumber: 1 });

// Index for OTP expiration cleanup
userSchema.index({ 'otp.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Generate OTP
userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
  
  this.otp = {
    code: otp,
    expiresAt: expiresAt,
    attempts: 0,
    lastSentAt: new Date()
  };
  
  return otp;
};

// Verify OTP
userSchema.methods.verifyOTP = function(inputOTP) {
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

// Check if OTP can be resent (rate limiting)
userSchema.methods.canResendOTP = function() {
  if (!this.otp.lastSentAt) return true;
  
  const timeSinceLastSent = Date.now() - this.otp.lastSentAt.getTime();
  const minInterval = 60 * 1000; // 1 minute
  
  return timeSinceLastSent >= minInterval;
};

// Update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);