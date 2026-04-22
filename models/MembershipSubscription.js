const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MembershipPlan",
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "paused", "cancelled", "expired"],
      default: "active",
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["cash", "card", "upi", "bank_transfer", "online"],
    },
    amountPaid: { type: Number, required: true },
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MembershipSubscription", subscriptionSchema);
