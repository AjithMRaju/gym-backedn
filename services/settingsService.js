/**
 * settingsService.js – business logic layer for all Settings operations.
 *
 * Handles:
 *  - Upsert with optimistic concurrency (version-based 409 conflict detection)
 *  - Partial updates (only provided fields are updated)
 *  - Notification settings bulk upsert
 *  - Audit log writes via the audit service
 */

const GymSettings = require("../models/GymSettings");
const BillingSettings = require("../models/BillingSettings");
const NotificationSettings = require("../models/NotificationSettings");
const { logAudit } = require("./audit");

const GYM_ID = "default"; // Single-tenant default; extend to req.admin.gym_id for multi-tenant

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip Mongoose-internals from a document before including it in audit logs.
 */
function toPlain(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.__v;
  delete obj._id;
  return obj;
}

/**
 * Pick only the keys that were supplied in the request body.
 * Undefined values are never spread, so Mongo $set won't overwrite untouched fields.
 */
function pickProvided(body, allowedKeys) {
  const result = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) result[key] = body[key];
  }
  return result;
}

// ─── GymSettings ─────────────────────────────────────────────────────────────

const GYM_ALLOWED_KEYS = [
  "name","logo_url","email","phone","gst_number","address",
  "timezone","currency","language","hours_weekday","hours_weekend",
];

async function getGymSettings() {
  let doc = await GymSettings.findOne({ gym_id: GYM_ID });
  if (!doc) {
    // Auto-create defaults on first access
    doc = await GymSettings.create({ gym_id: GYM_ID, name: "My Gym", email: "admin@mygym.com", phone: "+91-9999999999" });
  }
  return doc;
}

async function updateGymSettings(req, body) {
  const current = await getGymSettings();
  const oldValue = toPlain(current);

  // Optimistic concurrency: client must send the current __v
  if (body.__v !== undefined && body.__v !== current.__v) {
    const err = new Error("Settings were modified by another request. Please reload and try again.");
    err.statusCode = 409;
    err.code = "CONFLICT";
    throw err;
  }

  const updates = pickProvided(body, GYM_ALLOWED_KEYS);
  if (Object.keys(updates).length === 0) {
    return current; // nothing to update
  }

  updates.updated_by = req.admin._id;

  // Use findOneAndUpdate with $inc on __v for atomic version bump
  const updated = await GymSettings.findOneAndUpdate(
    { gym_id: GYM_ID },
    { $set: updates, $inc: { __v: 1 } },
    { new: true, runValidators: true }
  );

  await logAudit(req, "UPDATE_GYM_SETTINGS", "GymSettings", GYM_ID, oldValue, toPlain(updated));
  return updated;
}

// ─── BillingSettings ─────────────────────────────────────────────────────────

const BILLING_ALLOWED_KEYS = [
  "tax_rate","grace_period_days","late_fee","freeze_limit_days",
  "auto_renew","allow_guest_passes","invoice_prefix","invoice_footer",
];

async function getBillingSettings() {
  let doc = await BillingSettings.findOne({ gym_id: GYM_ID });
  if (!doc) {
    doc = await BillingSettings.create({ gym_id: GYM_ID });
  }
  return doc;
}

async function updateBillingSettings(req, body) {
  const current = await getBillingSettings();
  const oldValue = toPlain(current);

  if (body.__v !== undefined && body.__v !== current.__v) {
    const err = new Error("Settings were modified by another request. Please reload and try again.");
    err.statusCode = 409;
    err.code = "CONFLICT";
    throw err;
  }

  const updates = pickProvided(body, BILLING_ALLOWED_KEYS);
  if (Object.keys(updates).length === 0) return current;

  updates.updated_by = req.admin._id;

  const updated = await BillingSettings.findOneAndUpdate(
    { gym_id: GYM_ID },
    { $set: updates, $inc: { __v: 1 } },
    { new: true, runValidators: true }
  );

  await logAudit(req, "UPDATE_BILLING_SETTINGS", "BillingSettings", GYM_ID, oldValue, toPlain(updated));
  return updated;
}

// ─── NotificationSettings ─────────────────────────────────────────────────────

async function getNotificationSettings() {
  const docs = await NotificationSettings.find({ gym_id: GYM_ID });
  // Return as a keyed object: { expiry_reminder: { enabled, channels }, ... }
  return docs.reduce((acc, d) => {
    acc[d.key] = { enabled: d.enabled, channels: d.channels };
    return acc;
  }, {});
}

/**
 * Bulk-upsert notification settings.
 * @param {object} body  Map of key → { enabled, channels }
 *   e.g. { expiry_reminder: { enabled: true, channels: ["email","sms"] } }
 */
async function updateNotificationSettings(req, body) {
  const VALID_KEYS = NotificationSettings.VALID_KEYS;
  const oldValues = await getNotificationSettings();
  const ops = [];

  for (const key of VALID_KEYS) {
    if (body[key] === undefined) continue;

    const { enabled, channels } = body[key];
    ops.push(
      NotificationSettings.findOneAndUpdate(
        { gym_id: GYM_ID, key },
        {
          $set: {
            ...(enabled !== undefined && { enabled }),
            ...(channels !== undefined && { channels }),
            updated_by: req.admin._id,
          },
        },
        { new: true, upsert: true, runValidators: true }
      )
    );
  }

  const results = await Promise.all(ops);
  const newValues = results.reduce((acc, d) => {
    if (d) acc[d.key] = { enabled: d.enabled, channels: d.channels };
    return acc;
  }, {});

  await logAudit(req, "UPDATE_NOTIFICATION_SETTINGS", "NotificationSettings", GYM_ID, oldValues, newValues);
  return await getNotificationSettings();
}

// ─── Combined GET for first-page load ────────────────────────────────────────

async function getAllSettings() {
  const [gym, billing, notifications] = await Promise.all([
    getGymSettings(),
    getBillingSettings(),
    getNotificationSettings(),
  ]);
  return { gym, billing, notifications };
}

module.exports = {
  getGymSettings,
  updateGymSettings,
  getBillingSettings,
  updateBillingSettings,
  getNotificationSettings,
  updateNotificationSettings,
  getAllSettings,
};
