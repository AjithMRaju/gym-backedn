const mongoose = require("mongoose");

const robotPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: "Buddy",
      maxlength: 30,
      trim: true,
    },
    color: {
      type: String,
      default: "#f0763c",
      match: [/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color code (#RRGGBB)"],
    },
    accentColor: {
      type: String,
      default: "#f7d38b",
      match: [/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color code (#RRGGBB)"],
    },
    voiceEnabled: {
      type: Boolean,
      default: true,
    },
    voice: {
      type: String,
      default: "default",
    },
    defaultMode: {
      type: String,
      enum: ["happy", "thinking", "sad", "nervous", "sleeping"],
      default: "happy",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RobotPreference", robotPreferenceSchema);
