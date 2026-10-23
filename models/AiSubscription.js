const mongoose = require("mongoose");

const aiSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    gymId: {
      type: String,
      required: true,
      default: "default",
      index: true,
    },
    status: {
      type: String,
      enum: ["none", "trialing", "active", "past_due", "canceled"],
      default: "none",
      index: true,
    },
    plan: {
      type: String,
      default: null,
    },
    trialStartedAt: {
      type: Date,
      default: null,
    },
    trialEndsAt: {
      type: Date,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    providerCustomerId: {
      type: String,
      default: null,
    },
    trialUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

aiSubscriptionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("AiSubscription", aiSubscriptionSchema);
