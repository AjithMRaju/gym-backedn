const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const AdminSession = require("../models/AdminSession");
const { hashToken } = require("../utils/crypto");

/**
 * protect – verifies JWT and optionally checks session store for revocation.
 *
 * Attach req.admin (populated Admin doc) and req.sessionDoc (AdminSession, if any).
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Not authorized – no token",
      fieldErrors: {},
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Admin not found",
        fieldErrors: {},
      });
    }

    // Check session store for revocation (best-effort – if collection doesn't exist yet, skip)
    try {
      const tokenHash = hashToken(token);
      const session = await AdminSession.findOne({ token_hash: tokenHash });
      if (session) {
        if (session.revoked) {
          return res.status(401).json({
            code: "SESSION_REVOKED",
            message: "Session has been revoked. Please log in again.",
            fieldErrors: {},
          });
        }
        // Update last_active timestamp (fire-and-forget)
        AdminSession.updateOne({ _id: session._id }, { last_active: new Date() }).exec();
        req.sessionDoc = session;
      }
    } catch {
      // Non-fatal – session check is supplementary
    }

    req.admin = admin;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({
      code: "TOKEN_INVALID",
      message: "Token invalid or expired",
      fieldErrors: {},
    });
  }
};

module.exports = { protect };
