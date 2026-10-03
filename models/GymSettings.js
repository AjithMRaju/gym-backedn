const mongoose = require("mongoose");
const { IANA_TIMEZONES } = require("../utils/validators");

const gymSettingsSchema = new mongoose.Schema(
  {
    gym_id: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    logo_url: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: [/^\+?[\d\s\-().]{7,20}$/, "Invalid phone number"],
    },
    gst_number: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    timezone: {
      type: String,
      required: true,
      default: "Asia/Kolkata",
      validate: {
        validator: (v) => {
          try {
            Intl.DateTimeFormat(undefined, { timeZone: v });
            return true;
          } catch {
            return false;
          }
        },
        message: (props) => `${props.value} is not a valid IANA timezone`,
      },
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      match: [/^[A-Z]{3}$/, "Must be a valid ISO 4217 currency code (e.g. USD, INR)"],
    },
    language: {
      type: String,
      default: "en",
      minlength: 2,
      maxlength: 10,
    },
    hours_weekday: {
      open: { type: String, default: "06:00" },
      close: { type: String, default: "22:00" },
    },
    hours_weekend: {
      open: { type: String, default: "07:00" },
      close: { type: String, default: "20:00" },
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Optimistic concurrency version counter
    __v: { type: Number, select: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  }
);

module.exports = mongoose.model("GymSettings", gymSettingsSchema);
