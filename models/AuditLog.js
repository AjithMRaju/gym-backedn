const mongoose = require("mongoose");

/**
 * AuditLog – immutable record of every settings/security change.
 * Fields:
 *   actor_id    – the Admin who made the change
 *   actor_name  – snapshot of their name at the time
 *   action      – verb describing the operation (e.g. "UPDATE_GYM_SETTINGS")
 *   resource    – the document/collection affected
 *   resource_id – id of the affected document (gym_id or admin _id, etc.)
 *   old_value   – sanitized snapshot before the change
 *   new_value   – sanitized snapshot after the change
 *   ip          – client IP address
 *   user_agent  – client user-agent string
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    actor_name: { type: String, required: true },
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resource_id: { type: String, required: true },
    old_value: { type: mongoose.Schema.Types.Mixed, default: null },
    new_value: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    user_agent: { type: String, default: null },
  },
  {
    // Use a fixed field name for the timestamp to match our API convention
    timestamps: { createdAt: "timestamp", updatedAt: false },
    // Audit logs are append-only – disable auto-versioning
    versionKey: false,
  }
);

// TTL: auto-delete logs older than 2 years (optional – comment out if not needed)
// auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63_072_000 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
