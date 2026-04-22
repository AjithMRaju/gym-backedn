const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "MembershipPlan" },
    amount: { type: Number, required: true },
    method: {
      type: String,
      required: true,
      enum: ["cash", "card", "upi", "bank_transfer", "online"],
    },
    transactionId: String,
    type: {
      type: String,
      required: true,
      enum: ["membership", "session", "personal_training", "product", "other"],
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed",
    },
    notes: String,
    refundReason: String,
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);
