const mongoose = require("mongoose");

// Each document represents one notification rule (key) per gym.
// Supported keys: expiry_reminder | payment_receipt | class_booking | daily_summary
const VALID_KEYS = ["expiry_reminder", "payment_receipt", "class_booking", "daily_summary"];
const VALID_CHANNELS = ["email", "sms", "whatsapp", "push"];

const notificationSettingsSchema = new mongoose.Schema(
  {
    gym_id: {
      type: String,
      required: true,
      default: "default",
      index: true,
    },
    key: {
      type: String,
      required: true,
      enum: {
        values: VALID_KEYS,
        message: `Key must be one of: ${VALID_KEYS.join(", ")}`,
      },
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    // Subset of VALID_CHANNELS
    channels: {
      type: [String],
      default: ["email"],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.every((ch) => VALID_CHANNELS.includes(ch)),
        message: `channels must be an array containing only: ${VALID_CHANNELS.join(", ")}`,
      },
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Unique constraint: one row per (gym_id, key)
notificationSettingsSchema.index({ gym_id: 1, key: 1 }, { unique: true });

notificationSettingsSchema.statics.VALID_KEYS = VALID_KEYS;
notificationSettingsSchema.statics.VALID_CHANNELS = VALID_CHANNELS;

module.exports = mongoose.model("NotificationSettings", notificationSettingsSchema);
