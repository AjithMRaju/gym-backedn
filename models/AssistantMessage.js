const mongoose = require("mongoose");

const assistantMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssistantConversation",
      required: true,
      index: true,
    },
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
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    isVoice: {
      type: Boolean,
      default: false,
    },
    robotMode: {
      type: String,
      enum: ["happy", "thinking", "sad", "nervous", "sleeping"],
      default: null,
    },
    toolsUsed: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

assistantMessageSchema.index({ conversationId: 1, createdAt: 1 });
assistantMessageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("AssistantMessage", assistantMessageSchema);
