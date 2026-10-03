/**
 * authSettings.js – Security-related auth endpoints for the Settings panel.
 *
 * Prefix: /api/auth  (mounted in server.js alongside the existing auth.js routes,
 *                     OR merged into auth.js if preferred)
 *
 * Endpoints:
 *   POST   /auth/change-password   Change password (rate-limited, invalidates sessions)
 *   POST   /auth/2fa/enable        Generate a TOTP secret and QR code URI
 *   POST   /auth/2fa/verify        Verify TOTP token and activate 2FA
 *   GET    /auth/sessions           List all active sessions for the authenticated admin
 *   DELETE /auth/sessions/:id       Revoke a specific session
 *   DELETE /auth/sessions           Revoke all other sessions (keep current)
 */

const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const Admin = require("../models/Admin");
const AdminSession = require("../models/AdminSession");
const { protect } = require("../middleware/auth");
const { passwordLimiter, twoFALimiter } = require("../middleware/rateLimiter");
const { logAudit } = require("../services/audit");
const { hashToken } = require("../utils/crypto");
const { buildErrorPayload } = require("../utils/validators");

const BCRYPT_ROUNDS = 12;

// ─── Helper: sign a new JWT ───────────────────────────────────────────────────

function signToken(adminId) {
  return jwt.sign({ id: adminId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function getTokenExpiry(token) {
  const decoded = jwt.decode(token);
  return decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
}

function parseDevice(userAgent) {
  if (!userAgent) return "Unknown";
  if (/mobile/i.test(userAgent)) return "Mobile Browser";
  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/postman/i.test(userAgent)) return "Postman";
  return "Browser";
}

// ─── POST /api/auth/change-password ──────────────────────────────────────────
/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     summary: Change admin password (rate-limited, invalidates other sessions)
 *     tags: [Auth - Security]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 */
router.post("/change-password", protect, passwordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const fieldErrors = {};
  if (!currentPassword) fieldErrors.currentPassword = ["Current password is required"];
  if (!newPassword) fieldErrors.newPassword = ["New password is required"];
  else if (newPassword.length < 8) fieldErrors.newPassword = ["New password must be at least 8 characters"];

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json(buildErrorPayload("VALIDATION_ERROR", "Validation failed", fieldErrors));
  }

  try {
    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(404).json(buildErrorPayload("NOT_FOUND", "Admin not found"));
    }

    const matches = await admin.matchPassword(currentPassword);
    if (!matches) {
      return res.status(401).json(
        buildErrorPayload("INVALID_CREDENTIALS", "Current password is incorrect", {
          currentPassword: ["Current password is incorrect"],
        })
      );
    }

    // Hash new password
    admin.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await admin.save();

    // Revoke ALL sessions for this admin (except current) so other devices are logged out
    const currentHash = req.token ? hashToken(req.token) : null;
    await AdminSession.updateMany(
      { admin_id: admin._id, ...(currentHash ? { token_hash: { $ne: currentHash } } : {}) },
      { $set: { revoked: true, revoked_at: new Date() } }
    );

    await logAudit(req, "CHANGE_PASSWORD", "Admin", admin._id, null, { note: "Password changed" });

    // Issue a fresh token for the current session
    const newToken = signToken(admin._id);
    const newHash = hashToken(newToken);

    // Update the current session record if it exists
    if (currentHash) {
      await AdminSession.findOneAndUpdate(
        { token_hash: currentHash },
        { $set: { token_hash: newHash, expires_at: getTokenExpiry(newToken) } }
      );
    }

    res.json({ success: true, message: "Password updated. Other sessions have been revoked.", token: newToken });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── POST /api/auth/2fa/enable ───────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/2fa/enable:
 *   post:
 *     summary: Generate TOTP secret and QR code URI for 2FA setup
 *     tags: [Auth - Security]
 *     security: [{ bearerAuth: [] }]
 *
 * NOTE: Full TOTP requires a library like "speakeasy" or "otpauth".
 * This implementation generates a base32 secret and a standard otpauth:// URI.
 * Install `speakeasy` to enable actual TOTP verification:
 *   npm install speakeasy
 */
router.post("/2fa/enable", protect, twoFALimiter, async (req, res) => {
  try {
    // Generate a cryptographically-secure 20-byte random secret encoded in base32
    const secretBytes = crypto.randomBytes(20);
    const base32Secret = base32Encode(secretBytes);

    const admin = req.admin;
    const issuer = encodeURIComponent(process.env.APP_NAME || "GymAdmin");
    const account = encodeURIComponent(admin.email);
    const otpauthUri = `otpauth://totp/${issuer}:${account}?secret=${base32Secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    // Store the temporary secret in the admin document (pending verification)
    await Admin.findByIdAndUpdate(admin._id, {
      $set: { "twoFA.tempSecret": base32Secret, "twoFA.enabled": false },
    });

    res.json({
      success: true,
      data: {
        secret: base32Secret, // show once so user can enter it manually in authenticator app
        otpauth_uri: otpauthUri, // encode as QR on the client
      },
    });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── POST /api/auth/2fa/verify ───────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/2fa/verify:
 *   post:
 *     summary: Verify TOTP token and activate 2FA
 *     tags: [Auth - Security]
 *     security: [{ bearerAuth: [] }]
 */
router.post("/2fa/verify", protect, twoFALimiter, async (req, res) => {
  const { token: totpToken } = req.body;

  if (!totpToken) {
    return res.status(400).json(
      buildErrorPayload("VALIDATION_ERROR", "TOTP token is required", { token: ["Token is required"] })
    );
  }

  try {
    const admin = await Admin.findById(req.admin._id);
    if (!admin?.twoFA?.tempSecret) {
      return res.status(400).json(
        buildErrorPayload("PRECONDITION_FAILED", "2FA setup not initiated. Call /auth/2fa/enable first.")
      );
    }

    // Verify using TOTP algorithm (time-based, 30-second window)
    const expected = generateTOTP(admin.twoFA.tempSecret);
    if (totpToken !== expected) {
      // Allow ±1 period drift for clock skew
      const expectedPrev = generateTOTP(admin.twoFA.tempSecret, -1);
      const expectedNext = generateTOTP(admin.twoFA.tempSecret, 1);
      if (totpToken !== expectedPrev && totpToken !== expectedNext) {
        return res.status(401).json(
          buildErrorPayload("INVALID_TOKEN", "TOTP token is incorrect or expired", {
            token: ["Invalid or expired TOTP token"],
          })
        );
      }
    }

    // Activate 2FA
    await Admin.findByIdAndUpdate(admin._id, {
      $set: { "twoFA.enabled": true, "twoFA.secret": admin.twoFA.tempSecret },
      $unset: { "twoFA.tempSecret": "" },
    });

    await logAudit(req, "ENABLE_2FA", "Admin", admin._id, null, { twoFaEnabled: true });

    res.json({ success: true, message: "Two-factor authentication has been enabled." });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── GET /api/auth/sessions ───────────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/sessions:
 *   get:
 *     summary: List all active sessions for the authenticated admin
 *     tags: [Auth - Security]
 *     security: [{ bearerAuth: [] }]
 */
router.get("/sessions", protect, async (req, res) => {
  try {
    const sessions = await AdminSession.find({
      admin_id: req.admin._id,
      revoked: false,
      expires_at: { $gt: new Date() },
    })
      .select("-token_hash -__v") // Never expose the hash
      .sort({ last_active: -1 });

    // Mark the current session
    const currentHash = req.token ? hashToken(req.token) : null;
    const currentSession = currentHash
      ? await AdminSession.findOne({ token_hash: currentHash })
      : null;

    const enriched = sessions.map((s) => ({
      ...s.toObject(),
      is_current: currentSession ? s._id.equals(currentSession._id) : false,
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── DELETE /api/auth/sessions/:id ────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/sessions/{id}:
 *   delete:
 *     summary: Revoke a specific session
 *     tags: [Auth - Security]
 *     security: [{ bearerAuth: [] }]
 */
router.delete("/sessions/:id", protect, async (req, res) => {
  try {
    const session = await AdminSession.findOne({
      _id: req.params.id,
      admin_id: req.admin._id,
    });

    if (!session) {
      return res.status(404).json(buildErrorPayload("NOT_FOUND", "Session not found"));
    }

    session.revoked = true;
    session.revoked_at = new Date();
    await session.save();

    await logAudit(req, "REVOKE_SESSION", "AdminSession", session._id, null, { device: session.device });

    res.json({ success: true, message: "Session revoked." });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── DELETE /api/auth/sessions ────────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/sessions:
 *   delete:
 *     summary: Revoke all other sessions (keep current)
 *     tags: [Auth - Security]
 *     security: [{ bearerAuth: [] }]
 */
router.delete("/sessions", protect, async (req, res) => {
  try {
    const currentHash = req.token ? hashToken(req.token) : null;
    const result = await AdminSession.updateMany(
      {
        admin_id: req.admin._id,
        revoked: false,
        ...(currentHash ? { token_hash: { $ne: currentHash } } : {}),
      },
      { $set: { revoked: true, revoked_at: new Date() } }
    );

    await logAudit(req, "REVOKE_ALL_OTHER_SESSIONS", "AdminSession", req.admin._id, null, {
      revokedCount: result.modifiedCount,
    });

    res.json({
      success: true,
      message: `${result.modifiedCount} other session(s) have been revoked.`,
    });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── TOTP helper (pure JS, no deps) ──────────────────────────────────────────
// For production, replace this with the `speakeasy` or `otpauth` npm package.

function base32Encode(buf) {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += CHARS[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const output = [];
  for (const char of str.toUpperCase().replace(/=+$/, "")) {
    const idx = CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}

function generateTOTP(base32Secret, periodOffset = 0) {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / 30) + periodOffset;
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(0, 0);
  msg.writeUInt32BE(counter, 4);
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

module.exports = router;
