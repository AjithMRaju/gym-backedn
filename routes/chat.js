const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { protectChat } = require("../middleware/chatAuth");
const Conversation = require("../models/Conversation");
const ChatMessage = require("../models/ChatMessage");
const ChatNotification = require("../models/ChatNotification");
const Trainer = require("../models/Trainer");
const Admin = require("../models/Admin");
const { chatUpload, uploadToCloudinaryOrLocal } = require("../config/chatUpload");
const { getIO } = require("../services/chatSocket");

// Helper to sign JWT token
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ─── AUTHENTICATION ──────────────────────────────────────────────────────────

/**
 * @route   POST /api/chat/auth/trainer-login
 * @desc    Trainer login for real-time chat
 * @access  Public
 */
router.post("/auth/trainer-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const trainer = await Trainer.findOne({ email: email.toLowerCase().trim() }).select("+password");

    if (!trainer) {
      return res.status(401).json({
        success: false,
        message: "Invalid trainer email or password",
      });
    }

    // Check active status
    if (trainer.status !== "active") {
      return res.status(403).json({
        success: false,
        code: "TRAINER_INACTIVE",
        message: `Trainer account is currently '${trainer.status}'. Only active trainers can use chat.`,
      });
    }

    // Check password (if trainer doesn't have a password yet, set it on first login)
    if (!trainer.password) {
      trainer.password = password;
      await trainer.save();
    } else {
      const isMatch = await trainer.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Invalid trainer email or password",
        });
      }
    }

    const token = signToken({
      id: trainer._id,
      role: "trainer",
      email: trainer.email,
    });

    res.json({
      success: true,
      message: "Trainer logged in successfully",
      token,
      user: {
        id: trainer._id,
        role: "Trainer",
        name: trainer.name,
        email: trainer.email,
        phone: trainer.phone,
        photo: trainer.photo || "",
        status: trainer.status,
        specializations: trainer.specializations || [],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   GET /api/chat/auth/me
 * @desc    Get currently logged in chat user (Admin or Trainer)
 * @access  Protected
 */
router.get("/auth/me", protectChat, async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ─── ACTIVE TRAINERS DIRECTORY ───────────────────────────────────────────────

/**
 * @route   GET /api/chat/trainers/active
 * @desc    Get list of active trainers for starting chat conversations
 * @access  Protected (Admin only)
 */
router.get("/trainers/active", protectChat, async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { status: "active" };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { specializations: { $regex: search, $options: "i" } },
      ];
    }

    const trainers = await Trainer.find(filter)
      .select("name email phone photo specializations bio status experience")
      .sort({ name: 1 })
      .lean();

    // Attach existing conversation and unread message count for current admin
    const currentUserId = req.user.id;
    const trainerIds = trainers.map((t) => t._id);

    const conversations = await Conversation.find({
      admin: currentUserId,
      trainer: { $in: trainerIds },
    }).lean();

    const convMap = new Map();
    conversations.forEach((c) => {
      convMap.set(c.trainer.toString(), c);
    });

    const enrichedTrainers = trainers.map((trainer) => {
      const conv = convMap.get(trainer._id.toString());
      return {
        ...trainer,
        conversationId: conv ? conv._id : null,
        unreadCount: conv ? conv.unreadCountAdmin : 0,
        lastMessageText: conv ? conv.lastMessageText : null,
        lastMessageAt: conv ? conv.lastMessageAt : null,
      };
    });

    res.json({
      success: true,
      count: enrichedTrainers.length,
      data: enrichedTrainers,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CONVERSATIONS ───────────────────────────────────────────────────────────

/**
 * @route   POST /api/chat/conversations
 * @desc    Start or retrieve existing conversation between Admin and active Trainer
 * @access  Protected
 */
router.post("/conversations", protectChat, async (req, res) => {
  try {
    let adminId;
    let trainerId;

    if (req.user.role === "Admin") {
      adminId = req.user.id;
      trainerId = req.body.trainerId;
      if (!trainerId) {
        return res.status(400).json({ success: false, message: "trainerId is required" });
      }
    } else {
      trainerId = req.user.id;
      adminId = req.body.adminId;

      // If trainer initiates without adminId, assign to first superadmin/editor
      if (!adminId) {
        const defaultAdmin = await Admin.findOne().sort({ createdAt: 1 });
        if (!defaultAdmin) {
          return res.status(400).json({ success: false, message: "No admin found in system" });
        }
        adminId = defaultAdmin._id;
      }
    }

    // Verify Trainer exists and is ACTIVE
    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    if (trainer.status !== "active") {
      return res.status(403).json({
        success: false,
        code: "TRAINER_INACTIVE",
        message: `Cannot start chat. Trainer is currently '${trainer.status}'. Only active trainers can participate in chat.`,
      });
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      admin: adminId,
      trainer: trainerId,
    })
      .populate("admin", "name email")
      .populate("trainer", "name email phone photo specializations status");

    if (!conversation) {
      conversation = await Conversation.create({
        admin: adminId,
        trainer: trainerId,
      });

      conversation = await Conversation.findById(conversation._id)
        .populate("admin", "name email")
        .populate("trainer", "name email phone photo specializations status");
    }

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   GET /api/chat/conversations
 * @desc    Get all conversations for the logged in user
 * @access  Protected
 */
router.get("/conversations", protectChat, async (req, res) => {
  try {
    const userId = req.user.id;
    const filter =
      req.user.role === "Admin"
        ? { admin: userId }
        : { trainer: userId };

    const conversations = await Conversation.find(filter)
      .populate("admin", "name email")
      .populate("trainer", "name email phone photo specializations status")
      .populate("lastMessage")
      .sort({ lastMessageAt: -1 })
      .lean();

    const formatted = conversations.map((c) => ({
      ...c,
      unreadCount: req.user.role === "Admin" ? c.unreadCountAdmin : c.unreadCountTrainer,
      isTrainerActive: c.trainer?.status === "active",
    }));

    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   GET /api/chat/conversations/:id
 * @desc    Get single conversation details
 * @access  Protected
 */
router.get("/conversations/:id", protectChat, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate("admin", "name email")
      .populate("trainer", "name email phone photo specializations status")
      .populate("lastMessage");

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const userIdStr = req.user.id.toString();
    const isAdmin = conversation.admin._id.toString() === userIdStr;
    const isTrainer = conversation.trainer._id.toString() === userIdStr;

    if (!isAdmin && !isTrainer) {
      return res.status(403).json({ success: false, message: "Not authorized to view this conversation" });
    }

    res.json({
      success: true,
      data: {
        ...conversation.toObject(),
        unreadCount: isAdmin ? conversation.unreadCountAdmin : conversation.unreadCountTrainer,
        isTrainerActive: conversation.trainer.status === "active",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── MESSAGES & WHATSAPP-STYLE PAGINATION ────────────────────────────────────

/**
 * @route   GET /api/chat/conversations/:id/messages
 * @desc    Get messages in conversation with WhatsApp-style cursor pagination
 * @access  Protected
 */
router.get("/conversations/:id/messages", protectChat, async (req, res) => {
  try {
    const { id } = req.params;
    const { before, limit = 30, page } = req.query;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const userIdStr = req.user.id.toString();
    const isAdmin = conversation.admin.toString() === userIdStr;
    const isTrainer = conversation.trainer.toString() === userIdStr;

    if (!isAdmin && !isTrainer) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const pageSize = Math.min(Math.max(parseInt(limit) || 30, 1), 100);

    // Filter out messages deleted for current user ("delete for me")
    const filter = {
      conversation: id,
      deletedForUsers: { $ne: req.user.id },
    };

    // Cursor pagination (WhatsApp loads older messages scrolling upward)
    if (before) {
      if (mongoose.Types.ObjectId.isValid(before)) {
        const refMsg = await ChatMessage.findById(before);
        if (refMsg) {
          filter.createdAt = { $lt: refMsg.createdAt };
        }
      } else {
        const beforeDate = new Date(before);
        if (!isNaN(beforeDate.getTime())) {
          filter.createdAt = { $lt: beforeDate };
        }
      }
    } else if (page && parseInt(page) > 1) {
      // Offset pagination fallback
      // Handled via skip below
    }

    const totalCount = await ChatMessage.countDocuments({
      conversation: id,
      deletedForUsers: { $ne: req.user.id },
    });

    let query = ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(pageSize + 1);

    if (!before && page && parseInt(page) > 1) {
      query = query.skip((parseInt(page) - 1) * pageSize);
    }

    let messages = await query.lean();

    const hasMore = messages.length > pageSize;
    if (hasMore) {
      messages.pop(); // Remove extra peek element
    }

    // Format deleted messages (WhatsApp: "This message was deleted")
    messages = messages.map((msg) => {
      if (msg.isDeleted && msg.deletedForEveryone) {
        return {
          ...msg,
          text: "This message was deleted",
          attachments: [],
        };
      }
      return msg;
    });

    // Return in chronological order (oldest to newest) for chat stream
    messages.reverse();

    const oldestMessageId = messages.length > 0 ? messages[0]._id : null;
    const nextCursor = oldestMessageId;

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          total: totalCount,
          limit: pageSize,
          hasMore,
          nextCursor,
          oldestMessageId,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   POST /api/chat/conversations/:id/messages
 * @desc    Send a message via REST (alternative to WebSocket)
 * @access  Protected
 */
router.post("/conversations/:id/messages", protectChat, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      text = "",
      messageType = "text",
      attachments = [],
      replyToMessageId = null,
    } = req.body;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const trainer = await Trainer.findById(conversation.trainer);
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    if (trainer.status !== "active") {
      return res.status(403).json({
        success: false,
        code: "TRAINER_INACTIVE",
        message: `Cannot send message. Trainer is currently '${trainer.status}'. Only active trainers can participate in chat.`,
      });
    }

    const user = req.user;
    let recipientId;
    let recipientType;

    if (user.role === "Admin") {
      recipientId = conversation.trainer;
      recipientType = "Trainer";
    } else {
      recipientId = conversation.admin;
      recipientType = "Admin";
    }

    let replyToData = null;
    if (replyToMessageId) {
      const parentMsg = await ChatMessage.findById(replyToMessageId);
      if (parentMsg) {
        replyToData = {
          messageId: parentMsg._id,
          text: parentMsg.isDeleted ? "This message was deleted" : parentMsg.text,
          senderName: parentMsg.sender.name,
          senderType: parentMsg.sender.type,
          messageType: parentMsg.messageType,
          attachmentUrl: parentMsg.attachments?.[0]?.url || "",
        };
      }
    }

    const newMsg = await ChatMessage.create({
      conversation: conversation._id,
      sender: {
        id: user.id,
        type: user.role,
        name: user.name,
        photo: user.photo || "",
      },
      recipient: {
        id: recipientId,
        type: recipientType,
      },
      messageType,
      text: text.trim(),
      attachments,
      replyTo: replyToData,
      status: "sent",
    });

    let preview = text.trim();
    if (!preview) {
      if (messageType === "voice") {
        const dur = attachments?.[0]?.duration ? ` (${attachments[0].duration}s)` : "";
        preview = `🎤 Voice message${dur}`;
      } else if (messageType === "image") {
        preview = "📷 Photo";
      } else if (messageType === "video") {
        preview = "🎥 Video";
      } else if (messageType === "document") {
        preview = `📄 Document: ${attachments?.[0]?.fileName || "File"}`;
      } else {
        preview = "New attachment";
      }
    }

    const updateFields = {
      lastMessage: newMsg._id,
      lastMessageText: preview,
      lastMessageType: messageType,
      lastMessageSenderId: user.id,
      lastMessageAt: new Date(),
    };

    if (recipientType === "Admin") {
      updateFields.$inc = { unreadCountAdmin: 1 };
    } else {
      updateFields.$inc = { unreadCountTrainer: 1 };
    }

    await Conversation.findByIdAndUpdate(conversation._id, updateFields);

    // Create toast notification
    const notification = await ChatNotification.create({
      recipientId,
      recipientType,
      senderId: user.id,
      senderType: user.role,
      senderName: user.name,
      senderPhoto: user.photo || "",
      conversation: conversation._id,
      message: newMsg._id,
      title: `New message from ${user.name}`,
      preview,
      messageType,
    });

    // Emit Socket events if Socket server is active
    const io = getIO();
    if (io) {
      io.to(`conversation:${id}`).emit("new_message", newMsg);

      io.to(`user:${recipientId.toString()}`).emit("chat:notification", {
        notificationId: notification._id,
        type: "NEW_CHAT_MESSAGE",
        title: notification.title,
        message: notification.preview,
        preview: notification.preview,
        messageType: newMsg.messageType,
        conversationId: conversation._id,
        messageId: newMsg._id,
        sender: {
          id: user.id,
          name: user.name,
          role: user.role,
          photo: user.photo || "",
        },
        createdAt: newMsg.createdAt,
      });

      io.to(`user:${recipientId.toString()}`).emit("conversation_updated", {
        conversationId: conversation._id,
        lastMessage: newMsg,
        preview,
      });
    }

    res.status(201).json({
      success: true,
      data: newMsg,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PUT /api/chat/messages/:id
 * @desc    Edit a sent message
 * @access  Protected
 */
router.put("/messages/:id", protectChat, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: "Text is required to edit message" });
    }

    const msg = await ChatMessage.findById(id);
    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (msg.sender.id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "You can only edit your own messages" });
    }

    if (msg.isDeleted) {
      return res.status(400).json({ success: false, message: "Cannot edit a deleted message" });
    }

    msg.editHistory.push({
      text: msg.text,
      editedAt: new Date(),
    });
    msg.text = text.trim();
    msg.isEdited = true;
    msg.editedAt = new Date();
    await msg.save();

    // Broadcast update via Socket.io
    const io = getIO();
    if (io) {
      io.to(`conversation:${msg.conversation}`).emit("message_edited", {
        messageId: msg._id,
        conversationId: msg.conversation,
        newText: msg.text,
        isEdited: true,
        editedAt: msg.editedAt,
      });
    }

    res.json({
      success: true,
      data: msg,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   DELETE /api/chat/messages/:id
 * @desc    Delete message (WhatsApp: delete for everyone or delete for me)
 * @access  Protected
 */
router.delete("/messages/:id", protectChat, async (req, res) => {
  try {
    const { id } = req.params;
    const deleteType = req.body.deleteType || req.query.deleteType || "everyone";

    const msg = await ChatMessage.findById(id);
    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    const io = getIO();

    if (deleteType === "everyone") {
      if (msg.sender.id.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own messages for everyone",
        });
      }

      msg.isDeleted = true;
      msg.deletedForEveryone = true;
      msg.deletedAt = new Date();
      msg.deletedBy = req.user.id;
      msg.text = "This message was deleted";
      msg.attachments = [];
      await msg.save();

      if (io) {
        io.to(`conversation:${msg.conversation}`).emit("message_deleted", {
          messageId: msg._id,
          conversationId: msg.conversation,
          deletedForEveryone: true,
          deletedBy: req.user.id,
          deletedAt: msg.deletedAt,
          text: "This message was deleted",
        });
      }

      return res.json({
        success: true,
        message: "Message deleted for everyone",
        data: { messageId: msg._id, deleteType: "everyone" },
      });
    } else {
      // Delete for me
      if (!msg.deletedForUsers.includes(req.user.id)) {
        msg.deletedForUsers.push(req.user.id);
        await msg.save();
      }

      return res.json({
        success: true,
        message: "Message deleted for you",
        data: { messageId: msg._id, deleteType: "for_me" },
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PATCH /api/chat/conversations/:id/read
 * @desc    Mark all messages in conversation as read (Double Blue Ticks)
 * @access  Protected
 */
router.patch("/conversations/:id/read", protectChat, async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    if (req.user.role === "Admin") {
      conversation.unreadCountAdmin = 0;
    } else {
      conversation.unreadCountTrainer = 0;
    }
    await conversation.save();

    const readAt = new Date();
    const updateResult = await ChatMessage.updateMany(
      {
        conversation: id,
        "recipient.id": req.user.id,
        status: { $ne: "read" },
      },
      {
        $set: {
          status: "read",
          readAt,
        },
      }
    );

    // Mark notifications read
    await ChatNotification.updateMany(
      {
        conversation: id,
        recipientId: req.user.id,
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    const io = getIO();
    if (io) {
      io.to(`conversation:${id}`).emit("messages_read", {
        conversationId: id,
        readerId: req.user.id,
        readAt,
        count: updateResult.modifiedCount,
      });
    }

    res.json({
      success: true,
      message: "Messages marked as read",
      count: updateResult.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── FILE & VOICE ATTACHMENT UPLOAD ──────────────────────────────────────────

/**
 * @route   POST /api/chat/upload
 * @desc    Upload media or voice message attachment
 * @access  Protected
 */
router.post("/upload", protectChat, chatUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided" });
    }

    const uploaded = await uploadToCloudinaryOrLocal(req.file, req);

    res.status(201).json({
      success: true,
      data: {
        url: uploaded.url,
        publicId: uploaded.publicId,
        fileType: uploaded.fileType,
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
        mimeType: uploaded.mimeType,
        duration: req.body.duration ? parseFloat(req.body.duration) : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── TOAST NOTIFICATIONS API ─────────────────────────────────────────────────

/**
 * @route   GET /api/chat/notifications
 * @desc    Get real-time toast notifications for chat
 * @access  Protected
 */
router.get("/notifications", protectChat, async (req, res) => {
  try {
    const { unreadOnly = "true", limit = 20 } = req.query;
    const filter = { recipientId: req.user.id };

    if (unreadOnly === "true") {
      filter.isRead = false;
    }

    const notifications = await ChatNotification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 20, 50))
      .lean();

    const totalUnread = await ChatNotification.countDocuments({
      recipientId: req.user.id,
      isRead: false,
    });

    res.json({
      success: true,
      totalUnread,
      data: notifications,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PATCH /api/chat/notifications/:id/read
 * @desc    Mark a specific chat notification as read
 * @access  Protected
 */
router.patch("/notifications/:id/read", protectChat, async (req, res) => {
  try {
    const notification = await ChatNotification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipientId: req.user.id,
      },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PATCH /api/chat/notifications/mark-all-read
 * @desc    Mark all chat notifications as read for current user
 * @access  Protected
 */
router.patch("/notifications/mark-all-read", protectChat, async (req, res) => {
  try {
    const result = await ChatNotification.updateMany(
      { recipientId: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   GET /api/chat/unread-summary
 * @desc    Get total unread messages count and active conversations summary
 * @access  Protected
 */
router.get("/unread-summary", protectChat, async (req, res) => {
  try {
    const userId = req.user.id;
    const filter =
      req.user.role === "Admin"
        ? { admin: userId, unreadCountAdmin: { $gt: 0 } }
        : { trainer: userId, unreadCountTrainer: { $gt: 0 } };

    const conversationsWithUnread = await Conversation.find(filter)
      .select("admin trainer unreadCountAdmin unreadCountTrainer lastMessageText lastMessageAt")
      .populate("trainer", "name photo status")
      .populate("admin", "name")
      .lean();

    let totalUnread = 0;
    conversationsWithUnread.forEach((c) => {
      totalUnread += req.user.role === "Admin" ? c.unreadCountAdmin : c.unreadCountTrainer;
    });

    res.json({
      success: true,
      totalUnread,
      unreadConversationsCount: conversationsWithUnread.length,
      conversations: conversationsWithUnread,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
