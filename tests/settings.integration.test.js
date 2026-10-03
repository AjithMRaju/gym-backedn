/**
 * settings.integration.test.js – Integration tests for the Settings API.
 *
 * These tests spin up a real Express app connected to a test MongoDB instance
 * (uses the MONGO_URI from .env – tests run against your dev DB in a test namespace,
 *  or swap to mongodb-memory-server for a fully isolated environment).
 *
 * Prerequisites:
 *   npm install --save-dev jest supertest
 *   (Add "test": "jest --runInBand" to package.json scripts)
 *
 * Run: npx jest tests/settings.integration.test.js
 */

process.env.JWT_SECRET = "test_secret_123";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SETTINGS_ENCRYPTION_KEY = "a".repeat(64);
// Use a separate test database to avoid polluting dev data
process.env.MONGO_URI = process.env.MONGO_URI_TEST || process.env.MONGO_URI;

const request = require("supertest");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Import app AFTER env vars are set
const app = require("../server");

const Admin = require("../models/Admin");
const GymSettings = require("../models/GymSettings");
const BillingSettings = require("../models/BillingSettings");
const NotificationSettings = require("../models/NotificationSettings");

let superadminToken;
let editorToken;

// ─── Test Setup / Teardown ─────────────────────────────────────────────────────

beforeAll(async () => {
  // Wait for mongoose to connect (server.js connects on boot)
  await new Promise((resolve) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
  });

  // Clean up test data
  await Promise.all([
    Admin.deleteMany({ email: { $in: ["superadmin@test.com", "editor@test.com"] } }),
    GymSettings.deleteMany({ gym_id: "default" }),
    BillingSettings.deleteMany({ gym_id: "default" }),
    NotificationSettings.deleteMany({ gym_id: "default" }),
  ]);

  // Create test admins
  const hash = await bcrypt.hash("Password123!", 10);
  const superadmin = await Admin.create({
    name: "Test Owner",
    email: "superadmin@test.com",
    password: hash,
    role: "superadmin",
  });
  const editor = await Admin.create({
    name: "Test Editor",
    email: "editor@test.com",
    password: hash,
    role: "editor",
  });

  superadminToken = jwt.sign({ id: superadmin._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  editorToken = jwt.sign({ id: editor._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
});

afterAll(async () => {
  // Cleanup
  await Promise.all([
    Admin.deleteMany({ email: { $in: ["superadmin@test.com", "editor@test.com"] } }),
    GymSettings.deleteMany({ gym_id: "default" }),
    BillingSettings.deleteMany({ gym_id: "default" }),
    NotificationSettings.deleteMany({ gym_id: "default" }),
  ]);
  await mongoose.disconnect();
});

// ─── Helper ───────────────────────────────────────────────────────────────────
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// ─── GET /api/settings ────────────────────────────────────────────────────────
describe("GET /api/settings (combined)", () => {
  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  test("returns combined payload with valid token", async () => {
    const res = await request(app).get("/api/settings").set(auth(superadminToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("gym");
    expect(res.body.data).toHaveProperty("billing");
    expect(res.body.data).toHaveProperty("notifications");
  });
});

// ─── GET /api/settings/gym ────────────────────────────────────────────────────
describe("GET /api/settings/gym", () => {
  test("returns gym settings (auto-created defaults)", async () => {
    const res = await request(app).get("/api/settings/gym").set(auth(superadminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("name");
    expect(res.body.data).toHaveProperty("email");
    expect(res.body.data).toHaveProperty("timezone");
    expect(res.body.data).toHaveProperty("currency");
  });
});

// ─── PUT /api/settings/gym ────────────────────────────────────────────────────
describe("PUT /api/settings/gym", () => {
  test("updates gym name (superadmin)", async () => {
    const res = await request(app)
      .put("/api/settings/gym")
      .set(auth(superadminToken))
      .send({ name: "Iron Paradise Gym" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Iron Paradise Gym");
  });

  test("returns 403 for editor role", async () => {
    const res = await request(app)
      .put("/api/settings/gym")
      .set(auth(editorToken))
      .send({ name: "Hacked Name" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  test("validates email format", async () => {
    const res = await request(app)
      .put("/api/settings/gym")
      .set(auth(superadminToken))
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.fieldErrors).toHaveProperty("email");
  });

  test("validates IANA timezone", async () => {
    const res = await request(app)
      .put("/api/settings/gym")
      .set(auth(superadminToken))
      .send({ timezone: "Invalid/Zone" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("timezone");
  });

  test("validates ISO currency code", async () => {
    const res = await request(app)
      .put("/api/settings/gym")
      .set(auth(superadminToken))
      .send({ currency: "FAKE" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("currency");
  });

  test("detects optimistic concurrency conflict", async () => {
    // Get current version
    const getRes = await request(app).get("/api/settings/gym").set(auth(superadminToken));
    const currentVersion = getRes.body.data.__v;

    // Simulate stale version
    const res = await request(app)
      .put("/api/settings/gym")
      .set(auth(superadminToken))
      .send({ name: "Conflict Update", __v: currentVersion - 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  test("supports partial update (only name, not email)", async () => {
    const before = await request(app).get("/api/settings/gym").set(auth(superadminToken));
    const originalEmail = before.body.data.email;

    await request(app)
      .put("/api/settings/gym")
      .set(auth(superadminToken))
      .send({ name: "Partial Update Gym" });

    const after = await request(app).get("/api/settings/gym").set(auth(superadminToken));
    expect(after.body.data.name).toBe("Partial Update Gym");
    expect(after.body.data.email).toBe(originalEmail); // unchanged
  });
});

// ─── GET /api/settings/billing ───────────────────────────────────────────────
describe("GET /api/settings/billing", () => {
  test("returns billing settings", async () => {
    const res = await request(app).get("/api/settings/billing").set(auth(superadminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("tax_rate");
    expect(res.body.data).toHaveProperty("grace_period_days");
  });
});

// ─── PUT /api/settings/billing ───────────────────────────────────────────────
describe("PUT /api/settings/billing", () => {
  test("updates tax_rate (superadmin)", async () => {
    const res = await request(app)
      .put("/api/settings/billing")
      .set(auth(superadminToken))
      .send({ tax_rate: 12 });
    expect(res.status).toBe(200);
    expect(res.body.data.tax_rate).toBe(12);
  });

  test("rejects tax_rate > 100", async () => {
    const res = await request(app)
      .put("/api/settings/billing")
      .set(auth(superadminToken))
      .send({ tax_rate: 150 });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("tax_rate");
  });

  test("rejects negative late_fee", async () => {
    const res = await request(app)
      .put("/api/settings/billing")
      .set(auth(superadminToken))
      .send({ late_fee: -10 });
    expect(res.status).toBe(400);
  });

  test("returns 403 for editor", async () => {
    const res = await request(app)
      .put("/api/settings/billing")
      .set(auth(editorToken))
      .send({ tax_rate: 5 });
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/settings/notifications ─────────────────────────────────────────
describe("GET /api/settings/notifications", () => {
  test("returns notification settings keyed by rule name", async () => {
    const res = await request(app).get("/api/settings/notifications").set(auth(superadminToken));
    expect(res.status).toBe(200);
    // Returns a keyed object (possibly empty if seed hasn't run)
    expect(typeof res.body.data).toBe("object");
  });
});

// ─── PUT /api/settings/notifications ─────────────────────────────────────────
describe("PUT /api/settings/notifications", () => {
  test("bulk-updates notification rules", async () => {
    const res = await request(app)
      .put("/api/settings/notifications")
      .set(auth(superadminToken))
      .send({
        expiry_reminder: { enabled: true, channels: ["email", "sms"] },
        daily_summary: { enabled: false, channels: ["email"] },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.expiry_reminder.enabled).toBe(true);
    expect(res.body.data.expiry_reminder.channels).toContain("email");
  });

  test("rejects unknown notification key", async () => {
    const res = await request(app)
      .put("/api/settings/notifications")
      .set(auth(superadminToken))
      .send({ unknown_key: { enabled: true, channels: ["email"] } });
    expect(res.status).toBe(400);
  });

  test("rejects invalid channel", async () => {
    const res = await request(app)
      .put("/api/settings/notifications")
      .set(auth(superadminToken))
      .send({ expiry_reminder: { enabled: true, channels: ["telegram"] } });
    expect(res.status).toBe(400);
  });

  test("returns 403 for editor", async () => {
    const res = await request(app)
      .put("/api/settings/notifications")
      .set(auth(editorToken))
      .send({ expiry_reminder: { enabled: false } });
    expect(res.status).toBe(403);
  });
});

// ─── Error format consistency ────────────────────────────────────────────────
describe("Error response format", () => {
  test("all 4xx errors have { code, message, fieldErrors } shape", async () => {
    const res = await request(app)
      .put("/api/settings/gym")
      .set(auth(superadminToken))
      .send({ email: "bad" });
    expect(res.body).toHaveProperty("code");
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("fieldErrors");
  });
});
