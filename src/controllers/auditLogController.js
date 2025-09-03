const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');
const User = require('../models/User');

/**
 * Get audit logs with filtering and pagination
 */
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      actorId,
      targetId,
      action,
      actionCategory,
      riskLevel,
      success,
      flagged,
      reviewed,
      sensitiveAction,
      actorIP,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Apply filters
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (actorId) query.actorId = actorId;
    if (targetId) query.targetId = targetId;
    if (action) query.action = { $regex: action, $options: 'i' };
    if (actionCategory) query.actionCategory = actionCategory;
    if (riskLevel) {
      if (Array.isArray(riskLevel)) {
        query.riskLevel = { $in: riskLevel };
      } else {
        query.riskLevel = riskLevel;
      }
    }
    if (success !== undefined) query.success = success === 'true';
    if (flagged !== undefined) query.flagged = flagged === 'true';
    if (reviewed !== undefined) query.reviewed = reviewed === 'true';
    if (sensitiveAction !== undefined) query.sensitiveAction = sensitiveAction === 'true';
    if (actorIP) query.actorIP = actorIP;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const logs = await AuditLog.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('reviewedBy', 'name email role')
      .lean();

    const total = await AuditLog.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Log admin activity
    await req.admin.logActivity('view_audit_logs', {
      filters: { startDate, endDate, actorId, targetId, action, actionCategory, riskLevel },
      pagination: { page, limit },
      resultsCount: logs.length
    });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalLogs: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        summary: {
          totalLogs: total,
          criticalEvents: await AuditLog.countDocuments({ ...query, riskLevel: 'critical' }),
          highRiskEvents: await AuditLog.countDocuments({ ...query, riskLevel: 'high' }),
          flaggedEvents: await AuditLog.countDocuments({ ...query, flagged: true }),
          sensitiveActions: await AuditLog.countDocuments({ ...query, sensitiveAction: true })
        }
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit logs'
    });
  }
};

/**
 * Get audit log by ID
 */
const getAuditLogById = async (req, res) => {
  try {
    const { logId } = req.params;

    const log = await AuditLog.findById(logId)
      .populate('reviewedBy', 'name email role')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      });
    }

    // Log admin activity
    await req.admin.logActivity('view_audit_log_details', {
      auditLogId: logId,
      auditLogAction: log.action
    });

    res.json({
      success: true,
      data: { log }
    });
  } catch (error) {
    console.error('Get audit log by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit log'
    });
  }
};

/**
 * Get audit logs for specific actor (admin or user)
 */
const getActorAuditLogs = async (req, res) => {
  try {
    const { actorId } = req.params;
    const {
      startDate,
      endDate,
      actionCategory,
      riskLevel,
      page = 1,
      limit = 50
    } = req.query;

    const logs = await AuditLog.getActionsByActor(actorId, {
      startDate,
      endDate,
      actionCategory,
      riskLevel,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    const total = await AuditLog.countDocuments({
      actorId,
      ...(startDate || endDate ? {
        timestamp: {
          ...(startDate && { $gte: new Date(startDate) }),
          ...(endDate && { $lte: new Date(endDate) })
        }
      } : {}),
      ...(actionCategory && { actionCategory }),
      ...(riskLevel && { riskLevel })
    });

    // Get actor information
    let actorInfo = null;
    const admin = await Admin.findById(actorId).select('name email role');
    if (admin) {
      actorInfo = { ...admin.toObject(), type: 'admin' };
    } else {
      const user = await User.findById(actorId).select('name email status');
      if (user) {
        actorInfo = { ...user.toObject(), type: 'user' };
      }
    }

    // Log admin activity
    await req.admin.logActivity('view_actor_audit_logs', {
      targetActorId: actorId,
      actorType: actorInfo?.type,
      filters: { startDate, endDate, actionCategory, riskLevel },
      resultsCount: logs.length
    });

    res.json({
      success: true,
      data: {
        actor: actorInfo,
        logs,
        total,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get actor audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve actor audit logs'
    });
  }
};

/**
 * Get audit logs for specific target
 */
const getTargetAuditLogs = async (req, res) => {
  try {
    const { targetId, targetType } = req.params;
    const {
      startDate,
      endDate,
      actionCategory,
      page = 1,
      limit = 50
    } = req.query;

    const logs = await AuditLog.getActionsByTarget(targetId, targetType, {
      startDate,
      endDate,
      actionCategory,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    const total = await AuditLog.countDocuments({
      targetId,
      targetType,
      ...(startDate || endDate ? {
        timestamp: {
          ...(startDate && { $gte: new Date(startDate) }),
          ...(endDate && { $lte: new Date(endDate) })
        }
      } : {}),
      ...(actionCategory && { actionCategory })
    });

    // Get target information
    let targetInfo = null;
    if (targetType === 'admin') {
      const admin = await Admin.findById(targetId).select('name email role');
      if (admin) targetInfo = admin.toObject();
    } else if (targetType === 'user') {
      const user = await User.findById(targetId).select('name email status');
      if (user) targetInfo = user.toObject();
    }

    // Log admin activity
    await req.admin.logActivity('view_target_audit_logs', {
      targetId,
      targetType,
      filters: { startDate, endDate, actionCategory },
      resultsCount: logs.length
    });

    res.json({
      success: true,
      data: {
        target: { ...targetInfo, type: targetType },
        logs,
        total,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get target audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve target audit logs'
    });
  }
};

/**
 * Get security events (high-risk and flagged logs)
 */
const getSecurityEvents = async (req, res) => {
  try {
    const {
      riskLevel = ['high', 'critical'],
      flagged,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const logs = await AuditLog.getSecurityEvents({
      riskLevel: Array.isArray(riskLevel) ? riskLevel : [riskLevel],
      flagged: flagged !== undefined ? flagged === 'true' : undefined,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    const total = await AuditLog.countDocuments({
      riskLevel: { $in: Array.isArray(riskLevel) ? riskLevel : [riskLevel] },
      ...(flagged !== undefined && { flagged: flagged === 'true' }),
      ...(startDate || endDate ? {
        timestamp: {
          ...(startDate && { $gte: new Date(startDate) }),
          ...(endDate && { $lte: new Date(endDate) })
        }
      } : {})
    });

    // Get security summary
    const securitySummary = {
      totalSecurityEvents: total,
      criticalEvents: await AuditLog.countDocuments({ riskLevel: 'critical' }),
      highRiskEvents: await AuditLog.countDocuments({ riskLevel: 'high' }),
      flaggedEvents: await AuditLog.countDocuments({ flagged: true }),
      unreviewedEvents: await AuditLog.countDocuments({ 
        riskLevel: { $in: ['high', 'critical'] }, 
        reviewed: false 
      })
    };

    // Log admin activity
    await req.admin.logActivity('view_security_events', {
      filters: { riskLevel, flagged, startDate, endDate },
      resultsCount: logs.length
    });

    res.json({
      success: true,
      data: {
        logs,
        total,
        securitySummary,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get security events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve security events'
    });
  }
};

/**
 * Flag an audit log for review
 */
const flagAuditLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Flag reason is required'
      });
    }

    const log = await AuditLog.findById(logId);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      });
    }

    await log.flag(reason, req.admin._id);

    // Log admin activity
    await req.admin.logActivity('flag_audit_log', {
      auditLogId: logId,
      auditLogAction: log.action,
      flagReason: reason
    });

    res.json({
      success: true,
      message: 'Audit log flagged successfully',
      data: {
        log: {
          _id: log._id,
          action: log.action,
          flagged: log.flagged,
          flagReason: log.flagReason
        }
      }
    });
  } catch (error) {
    console.error('Flag audit log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flag audit log'
    });
  }
};

/**
 * Review an audit log
 */
const reviewAuditLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const { notes } = req.body;

    const log = await AuditLog.findById(logId);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      });
    }

    await log.review(notes, req.admin._id);

    // Log admin activity
    await req.admin.logActivity('review_audit_log', {
      auditLogId: logId,
      auditLogAction: log.action,
      reviewNotes: notes
    });

    res.json({
      success: true,
      message: 'Audit log reviewed successfully',
      data: {
        log: {
          _id: log._id,
          action: log.action,
          reviewed: log.reviewed,
          reviewNotes: log.reviewNotes,
          reviewedAt: log.reviewedAt
        }
      }
    });
  } catch (error) {
    console.error('Review audit log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review audit log'
    });
  }
};

/**
 * Get audit log statistics
 */
const getAuditLogStats = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.timestamp = {};
      if (startDate) matchStage.timestamp.$gte = new Date(startDate);
      if (endDate) matchStage.timestamp.$lte = new Date(endDate);
    }

    // Group by time period
    let dateGrouping;
    switch (groupBy) {
      case 'hour':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        };
        break;
      case 'day':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
        break;
      case 'month':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' }
        };
        break;
      default:
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
    }

    const [timeSeriesStats, categoryStats, riskLevelStats, actorStats] = await Promise.all([
      // Time series data
      AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: dateGrouping,
            totalActions: { $sum: 1 },
            successfulActions: { $sum: { $cond: ['$success', 1, 0] } },
            failedActions: { $sum: { $cond: ['$success', 0, 1] } },
            sensitiveActions: { $sum: { $cond: ['$sensitiveAction', 1, 0] } }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]),

      // Actions by category
      AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$actionCategory',
            count: { $sum: 1 },
            successRate: { $avg: { $cond: ['$success', 1, 0] } }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Actions by risk level
      AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$riskLevel',
            count: { $sum: 1 },
            flaggedCount: { $sum: { $cond: ['$flagged', 1, 0] } }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Top actors
      AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              actorId: '$actorId',
              actorEmail: '$actorEmail',
              actorType: '$actorType'
            },
            actionCount: { $sum: 1 },
            lastAction: { $max: '$timestamp' },
            riskActions: { $sum: { $cond: [{ $in: ['$riskLevel', ['high', 'critical']] }, 1, 0] } }
          }
        },
        { $sort: { actionCount: -1 } },
        { $limit: 10 }
      ])
    ]);

    // Log admin activity
    await req.admin.logActivity('view_audit_stats', {
      filters: { startDate, endDate, groupBy }
    });

    res.json({
      success: true,
      data: {
        timeSeriesStats,
        categoryStats,
        riskLevelStats,
        topActors: actorStats,
        summary: {
          totalLogs: await AuditLog.countDocuments(matchStage),
          criticalEvents: await AuditLog.countDocuments({ ...matchStage, riskLevel: 'critical' }),
          highRiskEvents: await AuditLog.countDocuments({ ...matchStage, riskLevel: 'high' }),
          flaggedEvents: await AuditLog.countDocuments({ ...matchStage, flagged: true }),
          sensitiveActions: await AuditLog.countDocuments({ ...matchStage, sensitiveAction: true })
        }
      }
    });
  } catch (error) {
    console.error('Get audit log stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit log statistics'
    });
  }
};

/**
 * Export audit logs
 */
const exportAuditLogs = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      format = 'json',
      includeDetails = true
    } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const selectFields = includeDetails === 'true' 
      ? {} // Include all fields
      : {
          action: 1,
          actionCategory: 1,
          actorEmail: 1,
          targetEmail: 1,
          success: 1,
          riskLevel: 1,
          timestamp: 1
        };

    const logs = await AuditLog.find(query)
      .select(selectFields)
      .sort({ timestamp: -1 })
      .lean();

    // Log admin activity
    await req.admin.logActivity('export_audit_logs', {
      filters: { startDate, endDate },
      format,
      includeDetails: includeDetails === 'true',
      exportedCount: logs.length
    });

    const exportData = {
      exportedAt: new Date(),
      exportedBy: req.admin.email,
      filters: { startDate, endDate },
      totalRecords: logs.length,
      data: logs
    };

    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(logs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: exportData
      });
    }
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export audit logs'
    });
  }
};

// Helper function to convert logs to CSV
function convertToCSV(logs) {
  if (logs.length === 0) return '';
  
  const headers = Object.keys(logs[0]).join(',');
  const rows = logs.map(log => 
    Object.values(log).map(value => 
      typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
    ).join(',')
  );
  
  return [headers, ...rows].join('\n');
}

module.exports = {
  getAuditLogs,
  getAuditLogById,
  getActorAuditLogs,
  getTargetAuditLogs,
  getSecurityEvents,
  flagAuditLog,
  reviewAuditLog,
  getAuditLogStats,
  exportAuditLogs
};