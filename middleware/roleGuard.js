/**
 * roleGuard.js – RBAC middleware.
 *
 * The existing Admin model has roles: "superadmin" | "editor"
 * Mapping to the spec's Owner/Admin concept:
 *   superadmin → Owner (full access)
 *   editor     → Staff (read-only on protected resources)
 *
 * Usage:
 *   router.put('/settings/gym', protect, requireRole('superadmin'), handler);
 *
 * @param {...string} roles  One or more allowed roles
 */
const { buildErrorPayload } = require("../utils/validators");

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json(
        buildErrorPayload("UNAUTHORIZED", "Authentication required")
      );
    }
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json(
        buildErrorPayload(
          "FORBIDDEN",
          `This action requires one of the following roles: ${roles.join(", ")}`
        )
      );
    }
    next();
  };
}

module.exports = { requireRole };
