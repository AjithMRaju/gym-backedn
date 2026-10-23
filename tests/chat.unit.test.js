/**
 * chat.unit.test.js – Unit tests for Real-time Chat data models & helpers.
 *
 * Run: npx jest tests/chat.unit.test.js
 */

const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const Conversation = require("../models/Conversation");
const ChatNotification = require("../models/ChatNotification");
const { getFileType } = require("../config/chatUpload");

describe("Chat Models & Validation Unit Tests", () => {
  const adminId = new mongoose.Types.ObjectId();
  const trainerId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();

  describe("getFileType helper", () => {
    test("identifies images correctly", () => {
      expect(getFileType("image/jpeg", "avatar.jpg")).toBe("image");
      expect(getFileType("image/png", "screenshot.png")).toBe("image");
      expect(getFileType("image/webp", "photo.webp")).toBe("image");
    });

    test("identifies videos correctly", () => {
      expect(getFileType("video/mp4", "clip.mp4")).toBe("video");
      expect(getFileType("video/webm", "record.webm")).toBe("video");
    });

    test("identifies audio & voice correctly", () => {
      expect(getFileType("audio/webm", "voice_note.webm")).toBe("voice");
      expect(getFileType("audio/mp3", "audio.mp3")).toBe("voice");
      expect(getFileType("audio/ogg", "record.ogg")).toBe("voice");
    });

    test("identifies documents correctly", () => {
      expect(getFileType("application/pdf", "workout_plan.pdf")).toBe("document");
      expect(getFileType("application/msword", "agreement.doc")).toBe("document");
    });
  });

  describe("Conversation Model Schema", () => {
    test("creates valid conversation object with default counters", () => {
      const conv = new Conversation({
        admin: adminId,
        trainer: trainerId,
      });

      expect(conv.admin).toEqual(adminId);
      expect(conv.trainer).toEqual(trainerId);
      expect(conv.unreadCountAdmin).toBe(0);
      expect(conv.unreadCountTrainer).toBe(0);
      expect(conv.isActive).toBe(true);
      expect(conv.validateSync()).toBeUndefined();
    });

    test("requires both admin and trainer", () => {
      const conv = new Conversation({});
      const err = conv.validateSync();
      expect(err.errors.admin).toBeDefined();
      expect(err.errors.trainer).toBeDefined();
    });
  });

  describe("ChatMessage Model Schema", () => {
    test("validates text message with WhatsApp ticks status", () => {
      const msg = new ChatMessage({
        conversation: conversationId,
        sender: {
          id: adminId,
          type: "Admin",
          name: "Gym Super Admin",
        },
        recipient: {
          id: trainerId,
          type: "Trainer",
        },
        messageType: "text",
        text: "Hello, please confirm your schedule for tomorrow.",
        status: "sent",
      });

      expect(msg.validateSync()).toBeUndefined();
      expect(msg.status).toBe("sent");
      expect(msg.isEdited).toBe(false);
      expect(msg.isDeleted).toBe(false);
    });

    test("validates voice message with duration and attachments", () => {
      const voiceMsg = new ChatMessage({
        conversation: conversationId,
        sender: {
          id: trainerId,
          type: "Trainer",
          name: "Rahul Trainer",
        },
        recipient: {
          id: adminId,
          type: "Admin",
        },
        messageType: "voice",
        attachments: [
          {
            url: "https://res.cloudinary.com/demo/video/upload/voice.webm",
            fileType: "voice",
            fileName: "voice-123.webm",
            duration: 15.4,
            mimeType: "audio/webm",
          },
        ],
      });

      expect(voiceMsg.validateSync()).toBeUndefined();
      expect(voiceMsg.messageType).toBe("voice");
      expect(voiceMsg.attachments[0].duration).toBe(15.4);
    });

    test("validates replyTo quoted message structure", () => {
      const replyMsg = new ChatMessage({
        conversation: conversationId,
        sender: {
          id: adminId,
          type: "Admin",
          name: "Admin",
        },
        recipient: {
          id: trainerId,
          type: "Trainer",
        },
        text: "I agree with your suggestion.",
        replyTo: {
          messageId: new mongoose.Types.ObjectId(),
          text: "Should we shift client batch to 6 PM?",
          senderName: "Rahul Trainer",
          senderType: "Trainer",
          messageType: "text",
        },
      });

      expect(replyMsg.validateSync()).toBeUndefined();
      expect(replyMsg.replyTo.senderName).toBe("Rahul Trainer");
    });

    test("validates edit message history and delete flag", () => {
      const msg = new ChatMessage({
        conversation: conversationId,
        sender: {
          id: adminId,
          type: "Admin",
          name: "Admin",
        },
        recipient: {
          id: trainerId,
          type: "Trainer",
        },
        text: "Updated text",
        isEdited: true,
        editedAt: new Date(),
        editHistory: [
          {
            text: "Original text before edit",
            editedAt: new Date(),
          },
        ],
        isDeleted: true,
        deletedForEveryone: true,
        deletedAt: new Date(),
      });

      expect(msg.validateSync()).toBeUndefined();
      expect(msg.isEdited).toBe(true);
      expect(msg.editHistory.length).toBe(1);
      expect(msg.deletedForEveryone).toBe(true);
    });
  });

  describe("ChatNotification Model Schema", () => {
    test("validates notification structure for toast display", () => {
      const notif = new ChatNotification({
        recipientId: trainerId,
        recipientType: "Trainer",
        senderId: adminId,
        senderType: "Admin",
        senderName: "Gym Admin",
        conversation: conversationId,
        message: new mongoose.Types.ObjectId(),
        title: "New message from Gym Admin",
        preview: "Hello, please confirm your schedule.",
        messageType: "text",
        isRead: false,
      });

      expect(notif.validateSync()).toBeUndefined();
      expect(notif.isRead).toBe(false);
      expect(notif.title).toContain("Gym Admin");
    });
  });
});
