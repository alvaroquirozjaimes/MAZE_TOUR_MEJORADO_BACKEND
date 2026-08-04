const { AdminActivityLog } = require('../models');

const auditContext = (req) => ({
  userId: req.user?.googleId || null,
  ipAddress: req.ip || null,
  userAgent: req.get?.('user-agent') || null,
});

const logAdminAction = async ({ req, action, entityType, entityId, details = {}, transaction }) =>
  AdminActivityLog.create(
    {
      ...auditContext(req),
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      details,
    },
    { transaction }
  );

module.exports = { auditContext, logAdminAction };
