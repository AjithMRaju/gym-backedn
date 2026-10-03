const mongoose = require("mongoose");

const billingSettingsSchema = new mongoose.Schema(
  {
    gym_id: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      index: true,
    },
    // Percentage: 0 - 100
    tax_rate: {
      type: Number,
      required: true,
      default: 18,
      min: [0, "Tax rate must be >= 0"],
      max: [100, "Tax rate must be <= 100"],
    },
    // Days after due date before a late fee is applied
    grace_period_days: {
      type: Number,
      required: true,
      default: 5,
      min: [0, "Grace period must be >= 0"],
      max: [365, "Grace period must be <= 365 days"],
    },
    // Late fee amount in the gym's currency
    late_fee: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Late fee must be >= 0"],
    },
    // Maximum consecutive days a membership can be frozen
    freeze_limit_days: {
      type: Number,
      required: true,
      default: 30,
      min: [0, "Freeze limit must be >= 0"],
      max: [365, "Freeze limit must be <= 365 days"],
    },
    auto_renew: {
      type: Boolean,
      required: true,
      default: false,
    },
    allow_guest_passes: {
      type: Boolean,
      required: true,
      default: false,
    },
    // Prefix for generated invoice numbers, e.g. "GYM-INV"
    invoice_prefix: {
      type: String,
      trim: true,
      default: "INV",
      maxlength: 20,
    },
    // Footer text that appears on all invoices
    invoice_footer: {
      type: String,
      trim: true,
      default: "Thank you for your business!",
      maxlength: 1000,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    __v: { type: Number, select: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  }
);

module.exports = mongoose.model("BillingSettings", billingSettingsSchema);
