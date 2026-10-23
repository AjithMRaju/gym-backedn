const mongoose = require("mongoose");

const assistantConversationSchema = new mongoose.Schema(
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
    title: {
      type: String,
      default: "New Conversation",
    },
  },
  { timestamps: true }
);

assistantConversationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("AssistantConversation", assistantConversationSchema);
