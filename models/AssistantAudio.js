const mongoose = require("mongoose");

const assistantAudioSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    mimeType: {
      type: String,
      default: "audio/mpeg",
    },
    data: {
      type: Buffer,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

assistantAudioSchema.index({ userId: 1, createdAt: -1 });
assistantAudioSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AssistantAudio", assistantAudioSchema);
