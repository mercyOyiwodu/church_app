const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getAuditLogById,
  getActorAuditLogs,
  getTargetAuditLogs,
  getSecurityEvents,
  flagAuditLog,
  reviewAuditLog,
  getAuditLogStats,
  exportAuditLogs
} = require('../controllers/auditLogController');
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

/**
 * @route GET /api/audit/logs
 * @desc Get audit logs with filtering and pagination
 * @access Admin+
 */
router.get('/logs',
  authenticateToken,
  requireAnyAdmin,
  auditLog('view_audit_logs'),
  getAuditLogs
);

/**
 * @route GET /api/audit/logs/:logId
 * @desc Get specific audit log by ID
 * @access Admin+
 */
router.get('/logs/:logId',
  authenticateToken,
  requireAnyAdmin,
  auditLog('view_audit_log_details'),
  getAuditLogById
);

/**
 * @route GET /api/audit/actor/:actorId
 * @desc Get audit logs for specific actor (admin or user)
 * @access Admin+
 */
router.get('/actor/:actorId',
  authenticateToken,
  requireAnyAdmin,
  auditLog('view_actor_audit_logs'),
  getActorAuditLogs
);

/**
 * @route GET /api/audit/target/:targetType/:targetId
 * @desc Get audit logs for specific target
 * @access Admin+
 */
router.get('/target/:targetType/:targetId',
  authenticateToken,
  requireAnyAdmin,
  auditLog('view_target_audit_logs'),
  getTargetAuditLogs
);

/**
 * @route GET /api/audit/security-events
 * @desc Get security events (high-risk and flagged logs)
 * @access Admin+
 */
router.get('/security-events',
  authenticateToken,
  requireAnyAdmin,
  auditLog('view_security_events'),
  getSecurityEvents
);

/**
 * @route POST /api/audit/logs/:logId/flag
 * @desc Flag an audit log for review
 * @access Admin+
 */
router.post('/logs/:logId/flag',
  authenticateToken,
  requireAnyAdmin,
  rateLimitSensitiveOps,
  auditLog('flag_audit_log'),
  flagAuditLog
);

/**
 * @route POST /api/audit/logs/:logId/review
 * @desc Review an audit log
 * @access Admin+
 */
router.post('/logs/:logId/review',
  authenticateToken,
  requireAnyAdmin,
  rateLimitSensitiveOps,
  auditLog('review_audit_log'),
  reviewAuditLog
);

/**
 * @route GET /api/audit/stats
 * @desc Get audit log statistics and analytics
 * @access Admin+
 */
router.get('/stats',
  authenticateToken,
  requireAnyAdmin,
  auditLog('view_audit_stats'),
  getAuditLogStats
);

/**
 * @route GET /api/audit/export
 * @desc Export audit logs
 * @access Super Admin only
 */
router.get('/export',
  authenticateToken,
  requireSuperAdmin,
  rateLimitSensitiveOps,
  auditLog('export_audit_logs'),
  exportAuditLogs
);

// Additional security-focused routes

/**
 * @route GET /api/audit/compliance/report
 * @desc Generate compliance report
 * @access Super Admin only
 */
router.get('/compliance/report',
  authenticateToken,
  requireSuperAdmin,
  auditLog('generate_compliance_report'),
  async (req, res) => {
    try {
      const { startDate, endDate, complianceType = 'general' } = req.query;
      
      const query = {};
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const AuditLog = require('../models/AuditLog');
      
      const [totalLogs, criticalEvents, sensitiveActions, failedActions, flaggedEvents] = await Promise.all([
        AuditLog.countDocuments(query),
        AuditLog.countDocuments({ ...query, riskLevel: 'critical' }),
        AuditLog.countDocuments({ ...query, sensitiveAction: true }),
        AuditLog.countDocuments({ ...query, success: false }),
        AuditLog.countDocuments({ ...query, flagged: true })
      ]);

      const complianceReport = {
        reportType: complianceType,
        period: { startDate, endDate },
        generatedAt: new Date(),
        generatedBy: req.admin.email,
        summary: {
          totalAuditLogs: totalLogs,
          criticalSecurityEvents: criticalEvents,
          sensitiveDataAccess: sensitiveActions,
          failedOperations: failedActions,
          flaggedActivities: flaggedEvents,
          complianceScore: Math.max(0, 100 - (criticalEvents * 5) - (flaggedEvents * 2))
        },
        recommendations: [
          ...(criticalEvents > 0 ? ['Review and investigate all critical security events'] : []),
          ...(flaggedEvents > 0 ? ['Address all flagged activities'] : []),
          ...(failedActions > totalLogs * 0.1 ? ['Investigate high failure rate'] : []),
          'Regular security training for administrators',
          'Implement additional monitoring for sensitive operations'
        ]
      };

      // Log admin activity
      await req.admin.logActivity('generate_compliance_report', {
        reportType: complianceType,
        period: { startDate, endDate },
        complianceScore: complianceReport.summary.complianceScore
      });

      res.json({
        success: true,
        data: { complianceReport }
      });
    } catch (error) {
      console.error('Generate compliance report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate compliance report'
      });
    }
  }
);

/**
 * @route GET /api/audit/alerts/recent
 * @desc Get recent security alerts
 * @access Admin+
 */
router.get('/alerts/recent',
  authenticateToken,
  requireAnyAdmin,
  auditLog('view_security_alerts'),
  async (req, res) => {
    try {
      const { hours = 24, limit = 50 } = req.query;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const AuditLog = require('../models/AuditLog');
      
      const alerts = await AuditLog.find({
        timestamp: { $gte: since },
        $or: [
          { riskLevel: 'critical' },
          { flagged: true },
          { sensitiveAction: true, success: false }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select('action actionCategory actorEmail targetEmail riskLevel flagged sensitiveAction success timestamp')
      .lean();

      const alertSummary = {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.riskLevel === 'critical').length,
        flaggedAlerts: alerts.filter(a => a.flagged).length,
        failedSensitiveActions: alerts.filter(a => a.sensitiveAction && !a.success).length
      };

      // Log admin activity
      await req.admin.logActivity('view_security_alerts', {
        timeframe: `${hours} hours`,
        alertCount: alerts.length
      });

      res.json({
        success: true,
        data: {
          alerts,
          summary: alertSummary,
          timeframe: `Last ${hours} hours`
        }
      });
    } catch (error) {
      console.error('Get security alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve security alerts'
      });
    }
  }
);

/**
 * @route POST /api/audit/cleanup
 * @desc Clean up old audit logs (archive or delete)
 * @access Super Admin only
 */
router.post('/cleanup',
  authenticateToken,
  requireSuperAdmin,
  rateLimitSensitiveOps,
  auditLog('cleanup_audit_logs'),
  async (req, res) => {
    try {
      const { 
        olderThanDays = 365, 
        action = 'archive', // 'archive' or 'delete'
        preserveCritical = true 
      } = req.body;

      if (!['archive', 'delete'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid cleanup action. Must be "archive" or "delete"'
        });
      }

      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      
      const query = {
        timestamp: { $lt: cutoffDate },
        ...(preserveCritical && { riskLevel: { $nin: ['critical'] } })
      };

      const AuditLog = require('../models/AuditLog');
      
      const logsToCleanup = await AuditLog.countDocuments(query);
      
      if (action === 'delete') {
        await AuditLog.deleteMany(query);
      } else {
        // Archive logic would go here - for now, just mark as archived
        await AuditLog.updateMany(query, { archived: true });
      }

      // Log admin activity
      await req.admin.logActivity('cleanup_audit_logs', {
        action,
        olderThanDays,
        preserveCritical,
        cleanedUpCount: logsToCleanup
      });

      res.json({
        success: true,
        message: `Successfully ${action}d ${logsToCleanup} audit logs`,
        data: {
          action,
          cleanedUpCount: logsToCleanup,
          cutoffDate
        }
      });
    } catch (error) {
      console.error('Cleanup audit logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup audit logs'
      });
    }
  }
);

module.exports = router;