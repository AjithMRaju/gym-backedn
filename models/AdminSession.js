const mongoose = require("mongoose");

/**
 * AdminSession – tracks active JWT sessions per admin.
 * On password change all sessions except the current one are invalidated.
 * On DELETE /auth/sessions/:id a specific session is revoked.
 */
const adminSessionSchema = new mongoose.Schema(
  {
    admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    // SHA-256 hash of the raw JWT (we never store raw tokens)
    token_hash: {
      type: String,
      required: true,
      unique: true,
    },
    // Human-readable device/browser info parsed from User-Agent
    device: { type: String, default: "Unknown" },
    ip: { type: String, default: null },
    user_agent: { type: String, default: null },
    // Soft-delete: revoked sessions are marked here so the auth middleware
    // can reject them even if the JWT hasn't expired yet.
    revoked: { type: Boolean, default: false },
    revoked_at: { type: Date, default: null },
    // When the JWT itself expires (copied from the JWT payload)
    expires_at: { type: Date, required: true },
    last_active: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Auto-delete expired sessions from MongoDB (runs every ~60 s)
adminSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminSession", adminSessionSchema);
