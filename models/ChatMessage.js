const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      type: {
        type: String,
        enum: ["Admin", "Trainer"],
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      photo: {
        type: String,
        default: "",
      },
    },
    recipient: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      type: {
        type: String,
        enum: ["Admin", "Trainer"],
        required: true,
      },
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "audio", "voice", "document"],
      default: "text",
    },
    text: {
      type: String,
      default: "",
      trim: true,
    },
    attachments: [
      {
        url: { type: String, required: true },
        publicId: { type: String, default: "" },
        fileType: {
          type: String,
          enum: ["image", "video", "audio", "voice", "document"],
          required: true,
        },
        fileName: { type: String, default: "" },
        fileSize: { type: Number, default: 0 },
        mimeType: { type: String, default: "" },
        duration: { type: Number, default: 0 }, // Duration in seconds for audio/voice
      },
    ],
    // Quoted reply message (WhatsApp style)
    replyTo: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChatMessage",
        default: null,
      },
      text: { type: String, default: "" },
      senderName: { type: String, default: "" },
      senderType: { type: String, default: "" },
      messageType: { type: String, default: "text" },
      attachmentUrl: { type: String, default: "" },
    },
    // Message delivery status (WhatsApp ticks: sent = single tick, delivered = double grey tick, read = double blue tick)
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Edit message tracking
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    editHistory: [
      {
        text: { type: String, required: true },
        editedAt: { type: Date, default: Date.now },
      },
    ],
    // Delete message tracking
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    deletedForUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, createdAt: -1 });
chatMessageSchema.index({ "recipient.id": 1, status: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
