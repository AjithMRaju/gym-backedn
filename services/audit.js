/**
 * audit.js – service for writing immutable audit log entries.
 *
 * Usage:
 *   const { logAudit } = require('../services/audit');
 *   await logAudit(req, 'UPDATE_GYM_SETTINGS', 'GymSettings', gymId, oldDoc, newDoc);
 */

const AuditLog = require("../models/AuditLog");

/**
 * Write one audit log entry.
 *
 * @param {object} req       Express request (for actor, ip, user-agent)
 * @param {string} action    Verb – e.g. "UPDATE_GYM_SETTINGS"
 * @param {string} resource  Collection name – e.g. "GymSettings"
 * @param {string} resourceId  Identifier of the changed document
 * @param {object|null} oldValue  Snapshot before the change (already sanitized)
 * @param {object|null} newValue  Snapshot after the change (already sanitized)
 */
async function logAudit(req, action, resource, resourceId, oldValue = null, newValue = null) {
  try {
    const actor = req.admin;
    await AuditLog.create({
      actor_id: actor._id,
      actor_name: actor.name,
      action,
      resource,
      resource_id: String(resourceId),
      old_value: oldValue,
      new_value: newValue,
      ip: req.ip || req.headers["x-forwarded-for"] || null,
      user_agent: req.headers["user-agent"] || null,
    });
  } catch (err) {
    // Audit logging is non-fatal – log to console but don't disrupt the main flow
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  }
}

module.exports = { logAudit };
