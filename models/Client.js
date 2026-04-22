const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    dateOfBirth: Date,
    gender: { type: String, enum: ["male", "female", "other"] },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zip: String,
    },
    emergencyContact: { name: String, phone: String, relation: String },
    photo: String,
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "inactive",
    },
    activeMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MembershipSubscription",
    },
    healthNotes: String,
    fitnessGoals: [String],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Client", clientSchema);
