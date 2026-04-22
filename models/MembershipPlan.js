const mongoose = require("mongoose");

const membershipPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
    durationUnit: {
      type: String,
      required: true,
      enum: ["days", "months", "years"],
    },
    features: [String],
    description: String,
    highlight: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MembershipPlan", membershipPlanSchema);
