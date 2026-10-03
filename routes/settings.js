/**
 * settings.js – Routes for the Settings API.
 *
 * Prefix: /api/settings  (mounted in server.js)
 *
 * Endpoints:
 *   GET  /                    Combined payload (gym + billing + notifications)
 *   GET  /gym                 Gym profile settings
 *   PUT  /gym                 Update gym profile (Owner/Admin only)
 *   POST /logo                Upload gym logo (multipart, ≤2 MB, png/jpg/svg)
 *   GET  /billing             Billing settings
 *   PUT  /billing             Update billing settings (Owner/Admin only)
 *   GET  /notifications       Notification settings (all keys)
 *   PUT  /notifications       Bulk-update notification settings (Owner/Admin only)
 */

const router = require("express").Router();
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const { protect } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");
const {
  getGymSettings,
  updateGymSettings,
  getBillingSettings,
  updateBillingSettings,
  getNotificationSettings,
  updateNotificationSettings,
  getAllSettings,
} = require("../services/settingsService");
const { isValidTimezone, isValidCurrency, isValidEmail, isValidPhone, buildErrorPayload } = require("../utils/validators");
const NotificationSettings = require("../models/NotificationSettings");

// ─── Logo upload (Cloudinary, logo folder, 2 MB, png/jpg/svg) ────────────────

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_ALLOWED_EXTS = ["jpg", "jpeg", "png", "svg"];
const LOGO_ALLOWED_MIMES = ["image/jpeg", "image/png", "image/svg+xml"];

const logoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "gym-backend/logo",
    allowed_formats: LOGO_ALLOWED_EXTS,
    public_id: `logo-${Date.now()}`,
    overwrite: true,
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (LOGO_ALLOWED_MIMES.includes(file.mimetype) && LOGO_ALLOWED_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Logo must be a PNG, JPG, or SVG file under 2 MB"));
    }
  },
});

// ─── Validation chains ────────────────────────────────────────────────────────

const gymValidators = [
  body("name").optional().notEmpty().withMessage("name cannot be empty").isLength({ max: 100 }),
  body("email").optional().custom((v) => {
    if (!isValidEmail(v)) throw new Error("Invalid email address");
    return true;
  }),
  body("phone").optional().custom((v) => {
    if (!isValidPhone(v)) throw new Error("Invalid phone number");
    return true;
  }),
  body("timezone").optional().custom((v) => {
    if (!isValidTimezone(v)) throw new Error(`${v} is not a valid IANA timezone`);
    return true;
  }),
  body("currency").optional().custom((v) => {
    if (!isValidCurrency(v)) throw new Error(`${v} is not a valid ISO 4217 currency code`);
    return true;
  }),
  body("gst_number").optional().isString().isLength({ max: 50 }),
  body("address").optional().isString().isLength({ max: 500 }),
  body("language").optional().isString().isLength({ min: 2, max: 10 }),
  body("hours_weekday.open").optional().matches(/^\d{2}:\d{2}$/).withMessage("hours_weekday.open must be HH:MM"),
  body("hours_weekday.close").optional().matches(/^\d{2}:\d{2}$/).withMessage("hours_weekday.close must be HH:MM"),
  body("hours_weekend.open").optional().matches(/^\d{2}:\d{2}$/).withMessage("hours_weekend.open must be HH:MM"),
  body("hours_weekend.close").optional().matches(/^\d{2}:\d{2}$/).withMessage("hours_weekend.close must be HH:MM"),
];

const billingValidators = [
  body("tax_rate").optional().isFloat({ min: 0, max: 100 }).withMessage("tax_rate must be 0–100"),
  body("grace_period_days").optional().isInt({ min: 0, max: 365 }).withMessage("grace_period_days must be 0–365"),
  body("late_fee").optional().isFloat({ min: 0 }).withMessage("late_fee must be >= 0"),
  body("freeze_limit_days").optional().isInt({ min: 0, max: 365 }).withMessage("freeze_limit_days must be 0–365"),
  body("auto_renew").optional().isBoolean(),
  body("allow_guest_passes").optional().isBoolean(),
  body("invoice_prefix").optional().isString().isLength({ max: 20 }),
  body("invoice_footer").optional().isString().isLength({ max: 1000 }),
];

const notificationValidators = [
  body().custom((body) => {
    const VALID_KEYS = NotificationSettings.VALID_KEYS;
    const VALID_CHANNELS = NotificationSettings.VALID_CHANNELS;
    for (const key of Object.keys(body)) {
      if (!VALID_KEYS.includes(key)) {
        throw new Error(`Unknown notification key: ${key}. Must be one of: ${VALID_KEYS.join(", ")}`);
      }
      const { enabled, channels } = body[key] || {};
      if (enabled !== undefined && typeof enabled !== "boolean") {
        throw new Error(`${key}.enabled must be a boolean`);
      }
      if (channels !== undefined) {
        if (!Array.isArray(channels)) throw new Error(`${key}.channels must be an array`);
        for (const ch of channels) {
          if (!VALID_CHANNELS.includes(ch)) {
            throw new Error(`${key}.channels contains invalid channel: ${ch}. Valid: ${VALID_CHANNELS.join(", ")}`);
          }
        }
      }
    }
    return true;
  }),
];

// ─── Helper: extract express-validator errors into fieldErrors map ────────────

function extractFieldErrors(result) {
  const fieldErrors = {};
  for (const err of result.array()) {
    const field = err.path || err.param || "_";
    if (!fieldErrors[field]) fieldErrors[field] = [];
    fieldErrors[field].push(err.msg);
  }
  return fieldErrors;
}

function validateRequest(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    res.status(400).json(buildErrorPayload("VALIDATION_ERROR", "Validation failed", extractFieldErrors(result)));
    return false;
  }
  return true;
}

// ─── All routes require authentication ───────────────────────────────────────

router.use(protect);

// ─── GET /api/settings – combined payload ─────────────────────────────────────
/**
 * @openapi
 * /api/settings:
 *   get:
 *     summary: Get all settings (combined)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Combined gym, billing, and notification settings
 */
router.get("/", async (req, res) => {
  try {
    const data = await getAllSettings();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── GET /api/settings/gym ────────────────────────────────────────────────────
/**
 * @openapi
 * /api/settings/gym:
 *   get:
 *     summary: Get gym profile settings
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get("/gym", async (req, res) => {
  try {
    const gym = await getGymSettings();
    res.json({ success: true, data: gym });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── PUT /api/settings/gym ────────────────────────────────────────────────────
/**
 * @openapi
 * /api/settings/gym:
 *   put:
 *     summary: Update gym profile settings (Owner/Admin only)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.put("/gym", requireRole("superadmin"), gymValidators, async (req, res) => {
  if (!validateRequest(req, res)) return;
  try {
    const updated = await updateGymSettings(req, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json(buildErrorPayload(err.code || "INTERNAL_ERROR", err.message));
  }
});

// ─── POST /api/settings/logo ─────────────────────────────────────────────────
/**
 * @openapi
 * /api/settings/logo:
 *   post:
 *     summary: Upload gym logo (multipart, ≤2 MB, PNG/JPG/SVG)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 */
router.post("/logo", requireRole("superadmin"), (req, res) => {
  logoUpload.single("logo")(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Logo exceeds the 2 MB size limit"
          : err.message || "File upload failed";
      return res.status(400).json(buildErrorPayload("UPLOAD_ERROR", msg));
    }
    if (!req.file) {
      return res.status(400).json(buildErrorPayload("UPLOAD_ERROR", "No file uploaded"));
    }

    try {
      const logoUrl = req.file.path; // Cloudinary secure URL
      const updated = await updateGymSettings(req, { logo_url: logoUrl });
      res.json({ success: true, data: { logo_url: logoUrl, gym: updated } });
    } catch (err2) {
      res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err2.message));
    }
  });
});

// ─── GET /api/settings/billing ───────────────────────────────────────────────
/**
 * @openapi
 * /api/settings/billing:
 *   get:
 *     summary: Get billing settings
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get("/billing", async (req, res) => {
  try {
    const billing = await getBillingSettings();
    res.json({ success: true, data: billing });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── PUT /api/settings/billing ───────────────────────────────────────────────
/**
 * @openapi
 * /api/settings/billing:
 *   put:
 *     summary: Update billing settings (Owner/Admin only)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.put("/billing", requireRole("superadmin"), billingValidators, async (req, res) => {
  if (!validateRequest(req, res)) return;
  try {
    const updated = await updateBillingSettings(req, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json(buildErrorPayload(err.code || "INTERNAL_ERROR", err.message));
  }
});

// ─── GET /api/settings/notifications ─────────────────────────────────────────
/**
 * @openapi
 * /api/settings/notifications:
 *   get:
 *     summary: Get notification settings
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get("/notifications", async (req, res) => {
  try {
    const notifications = await getNotificationSettings();
    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

// ─── PUT /api/settings/notifications ─────────────────────────────────────────
/**
 * @openapi
 * /api/settings/notifications:
 *   put:
 *     summary: Bulk update notification settings (Owner/Admin only)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.put("/notifications", requireRole("superadmin"), notificationValidators, async (req, res) => {
  if (!validateRequest(req, res)) return;
  try {
    const updated = await updateNotificationSettings(req, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json(buildErrorPayload("INTERNAL_ERROR", err.message));
  }
});

module.exports = router;
