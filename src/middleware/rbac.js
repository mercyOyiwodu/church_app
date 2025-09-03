const Admin = require('../models/Admin');

/**
 * Role-based access control middleware
 * Checks if the authenticated admin has the required role
 */
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.admin || !req.admin.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const admin = await Admin.findById(req.admin.id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      if (admin.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Admin account is not active'
        });
      }

      // Check if admin role is in allowed roles
      if (!allowedRoles.includes(admin.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions for this action'
        });
      }

      // Attach admin data to request
      req.adminData = admin;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Permission-based access control middleware
 * Checks if the authenticated admin has specific permissions
 */
const requirePermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      if (!req.admin || !req.admin.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const admin = await Admin.findById(req.admin.id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      if (admin.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Admin account is not active'
        });
      }

      // Check if admin has the required permission
      if (!admin.hasPermission(resource, action)) {
        await admin.logActivity('permission_denied', {
          resource,
          action,
          requestedEndpoint: req.originalUrl
        }, req);

        return res.status(403).json({
          success: false,
          message: `Insufficient permissions: ${resource}.${action} required`
        });
      }

      // Attach admin data to request
      req.adminData = admin;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Super admin only middleware
 */
const requireSuperAdmin = requireRole(['super_admin']);

/**
 * Admin or super admin middleware
 */
const requireAdminOrAbove = requireRole(['admin', 'super_admin']);

/**
 * Any admin role middleware (including moderator)
 */
const requireAnyAdmin = requireRole(['moderator', 'admin', 'super_admin']);

/**
 * Resource ownership middleware
 * Checks if the admin owns the resource or has permission to access it
 */
const requireOwnershipOrPermission = (resourceField = 'createdBy', permission = null) => {
  return async (req, res, next) => {
    try {
      if (!req.admin || !req.admin.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const admin = await Admin.findById(req.admin.id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Super admin can access everything
      if (admin.role === 'super_admin') {
        req.adminData = admin;
        return next();
      }

      // Check if admin has specific permission
      if (permission) {
        const [resource, action] = permission.split('.');
        if (admin.hasPermission(resource, action)) {
          req.adminData = admin;
          return next();
        }
      }

      // Check ownership (this would need to be implemented based on the specific resource)
      // For now, we'll allow access if the admin is the owner
      const resourceId = req.params.id || req.params.adminId || req.params.userId;
      if (resourceId && resourceId === admin._id.toString()) {
        req.adminData = admin;
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'Access denied: insufficient permissions or ownership required'
      });
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Dynamic permission middleware factory
 * Creates middleware that checks multiple permission combinations
 */
const requireAnyPermission = (permissionSets) => {
  return async (req, res, next) => {
    try {
      if (!req.admin || !req.admin.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const admin = await Admin.findById(req.admin.id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      if (admin.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Admin account is not active'
        });
      }

      // Check if admin has any of the required permissions
      const hasPermission = permissionSets.some(permissionSet => {
        const [resource, action] = permissionSet.split('.');
        return admin.hasPermission(resource, action);
      });

      if (!hasPermission) {
        await admin.logActivity('permission_denied', {
          requiredPermissions: permissionSets,
          requestedEndpoint: req.originalUrl
        }, req);

        return res.status(403).json({
          success: false,
          message: `Insufficient permissions: one of [${permissionSets.join(', ')}] required`
        });
      }

      // Attach admin data to request
      req.adminData = admin;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Rate limiting middleware for sensitive operations
 */
const rateLimitSensitiveOps = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();

  return (req, res, next) => {
    const key = `${req.admin.id}:${req.originalUrl}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old attempts
    const userAttempts = attempts.get(key) || [];
    const recentAttempts = userAttempts.filter(timestamp => timestamp > windowStart);

    if (recentAttempts.length >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please try again later.',
        retryAfter: Math.ceil((recentAttempts[0] + windowMs - now) / 1000)
      });
    }

    // Record this attempt
    recentAttempts.push(now);
    attempts.set(key, recentAttempts);

    next();
  };
};

/**
 * Audit logging middleware for sensitive operations
 */
const auditLog = (operation) => {
  return async (req, res, next) => {
    try {
      // Store original res.json to intercept response
      const originalJson = res.json;
      
      res.json = function(data) {
        // Log the operation after response
        setImmediate(async () => {
          try {
            if (req.adminData) {
              await req.adminData.logActivity(`audit_${operation}`, {
                operation,
                endpoint: req.originalUrl,
                method: req.method,
                params: req.params,
                query: req.query,
                success: data.success,
                statusCode: res.statusCode
              }, req);
            }
          } catch (error) {
            console.error('Audit logging error:', error);
          }
        });
        
        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Audit middleware error:', error);
      next();
    }
  };
};

/**
 * IP whitelist middleware for super sensitive operations
 */
const requireWhitelistedIP = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    // In development, allow all IPs
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    if (!allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: IP not whitelisted'
      });
    }

    next();
  };
};

/**
 * Time-based access control middleware
 */
const requireBusinessHours = (startHour = 9, endHour = 17) => {
  return (req, res, next) => {
    const now = new Date();
    const currentHour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    // In development, allow all times
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    if (isWeekend || currentHour < startHour || currentHour >= endHour) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: operation only allowed during business hours'
      });
    }

    next();
  };
};

module.exports = {
  requireRole,
  requirePermission,
  requireSuperAdmin,
  requireAdminOrAbove,
  requireAnyAdmin,
  requireOwnershipOrPermission,
  requireAnyPermission,
  rateLimitSensitiveOps,
  auditLog,
  requireWhitelistedIP,
  requireBusinessHours
};