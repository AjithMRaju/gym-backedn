const mongoose = require("mongoose");

const chatNotificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    recipientType: {
      type: String,
      enum: ["Admin", "Trainer"],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderType: {
      type: String,
      enum: ["Admin", "Trainer"],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    senderPhoto: {
      type: String,
      default: "",
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    preview: {
      type: String,
      required: true,
    },
    messageType: {
      type: String,
      default: "text",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

chatNotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("ChatNotification", chatNotificationSchema);
