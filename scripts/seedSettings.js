/**
 * seedSettings.js – Seed default gym, billing, and notification settings.
 *
 * Run: node scripts/seedSettings.js
 *
 * Safe to run multiple times (uses upsert / skip-if-exists logic).
 */

require("dotenv").config();
const mongoose = require("mongoose");

const GymSettings = require("../models/GymSettings");
const BillingSettings = require("../models/BillingSettings");
const NotificationSettings = require("../models/NotificationSettings");

const GYM_ID = "default";

const DEFAULT_GYM = {
  gym_id: GYM_ID,
  name: "My Gym",
  email: "admin@mygym.com",
  phone: "+91-9999999999",
  gst_number: null,
  address: "123 Fitness Street, Health City",
  timezone: "Asia/Kolkata",
  currency: "INR",
  language: "en",
  hours_weekday: { open: "06:00", close: "22:00" },
  hours_weekend: { open: "07:00", close: "20:00" },
};

const DEFAULT_BILLING = {
  gym_id: GYM_ID,
  tax_rate: 18,
  grace_period_days: 5,
  late_fee: 0,
  freeze_limit_days: 30,
  auto_renew: false,
  allow_guest_passes: false,
  invoice_prefix: "INV",
  invoice_footer: "Thank you for choosing My Gym. Stay fit, stay healthy!",
};

const DEFAULT_NOTIFICATIONS = [
  { gym_id: GYM_ID, key: "expiry_reminder",  enabled: true,  channels: ["email", "sms"] },
  { gym_id: GYM_ID, key: "payment_receipt",  enabled: true,  channels: ["email"] },
  { gym_id: GYM_ID, key: "class_booking",    enabled: true,  channels: ["email", "push"] },
  { gym_id: GYM_ID, key: "daily_summary",    enabled: false, channels: ["email"] },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Gym Settings
  const gymExists = await GymSettings.findOne({ gym_id: GYM_ID });
  if (!gymExists) {
    await GymSettings.create(DEFAULT_GYM);
    console.log("✅ Created default GymSettings");
  } else {
    console.log("⏭  GymSettings already exists – skipping");
  }

  // Billing Settings
  const billingExists = await BillingSettings.findOne({ gym_id: GYM_ID });
  if (!billingExists) {
    await BillingSettings.create(DEFAULT_BILLING);
    console.log("✅ Created default BillingSettings");
  } else {
    console.log("⏭  BillingSettings already exists – skipping");
  }

  // Notification Settings (upsert each key)
  for (const notif of DEFAULT_NOTIFICATIONS) {
    const exists = await NotificationSettings.findOne({ gym_id: GYM_ID, key: notif.key });
    if (!exists) {
      await NotificationSettings.create(notif);
      console.log(`✅ Created notification rule: ${notif.key}`);
    } else {
      console.log(`⏭  Notification rule "${notif.key}" already exists – skipping`);
    }
  }

  await mongoose.disconnect();
  console.log("✅ Seed complete.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
