const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    trainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trainer",
      required: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      default: null,
    },
    lastMessageText: {
      type: String,
      default: "",
    },
    lastMessageType: {
      type: String,
      default: "text",
    },
    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    unreadCountAdmin: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadCountTrainer: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate conversation between same admin and trainer
conversationSchema.index({ admin: 1, trainer: 1 }, { unique: true });
conversationSchema.index({ trainer: 1, lastMessageAt: -1 });
conversationSchema.index({ admin: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
