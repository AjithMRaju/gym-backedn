const { Server } = require("socket.io");
const { verifyChatUser } = require("../middleware/chatAuth");
const Conversation = require("../models/Conversation");
const ChatMessage = require("../models/ChatMessage");
const ChatNotification = require("../models/ChatNotification");
const Trainer = require("../models/Trainer");

let io = null;

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();

/**
 * Initialize Socket.io server
 */
const initChatSocket = (httpServer, allowedOrigins = ["*"]) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow all in dev or check against allowed list
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(null, true); // Permissive for local testing / cross-origin web apps
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication Middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "") ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const { user, userType } = await verifyChatUser(token);
      socket.user = user;
      socket.userType = userType;
      next();
    } catch (err) {
      return next(new Error(`Authentication error: ${err.message}`));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.user;
    const userId = user.id.toString();

    // Join personal notification & direct messaging room
    const userRoom = `user:${userId}`;
    socket.join(userRoom);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Broadcast online status to all connected clients
    io.emit("user_status", {
      userId,
      userType: user.role,
      isOnline: true,
      lastSeen: new Date(),
    });

    // ─── JOIN CONVERSATION ROOM ──────────────────────────────────────────────
    socket.on("join_conversation", async (data, callback) => {
      try {
        const conversationId = typeof data === "string" ? data : data?.conversationId;
        if (!conversationId) return;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ success: false, message: "Conversation not found" });
          return;
        }

        // Verify participant
        const isAdmin = user.role === "Admin" && conversation.admin.toString() === userId;
        const isTrainer = user.role === "Trainer" && conversation.trainer.toString() === userId;

        if (!isAdmin && !isTrainer) {
          if (callback) callback({ success: false, message: "Not authorized for this conversation" });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        if (callback) callback({ success: true, conversationId });
      } catch (err) {
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // ─── LEAVE CONVERSATION ROOM ─────────────────────────────────────────────
    socket.on("leave_conversation", (data) => {
      const conversationId = typeof data === "string" ? data : data?.conversationId;
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    // ─── SEND MESSAGE ────────────────────────────────────────────────────────
    socket.on("send_message", async (data, callback) => {
      try {
        const {
          conversationId,
          text = "",
          messageType = "text",
          attachments = [],
          replyToMessageId = null,
        } = data;

        if (!conversationId) {
          throw new Error("conversationId is required");
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          throw new Error("Conversation not found");
        }

        // Validate active trainer requirement
        const trainer = await Trainer.findById(conversation.trainer);
        if (!trainer) {
          throw new Error("Trainer not found");
        }
        if (trainer.status !== "active") {
          throw new Error(
            `Cannot chat with trainer. Trainer status is '${trainer.status}'. Only active trainers can participate in chat.`
          );
        }

        // Determine recipient
        let recipientId;
        let recipientType;
        if (user.role === "Admin") {
          recipientId = conversation.trainer;
          recipientType = "Trainer";
        } else {
          recipientId = conversation.admin;
          recipientType = "Admin";
        }

        // Check if replyTo message exists
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

        // Create message in database
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

        // Determine preview text for notifications & last message
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

        // Update Conversation last message & unread count
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

        // Check if recipient is online
        const recipientRoom = `user:${recipientId.toString()}`;
        const isRecipientOnline = onlineUsers.has(recipientId.toString());

        if (isRecipientOnline) {
          newMsg.status = "delivered";
          newMsg.deliveredAt = new Date();
          await newMsg.save();
        }

        // Create ChatNotification for Toast / Notification Center
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

        // Broadcast new message to conversation room
        io.to(`conversation:${conversationId}`).emit("new_message", newMsg);

        // Emit real-time notification TOAST event to recipient's personal room
        io.to(recipientRoom).emit("chat:notification", {
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

        // Also emit unread count update to recipient
        io.to(recipientRoom).emit("conversation_updated", {
          conversationId: conversation._id,
          lastMessage: newMsg,
          preview,
        });

        if (callback) {
          callback({ success: true, data: newMsg });
        }
      } catch (err) {
        if (callback) {
          callback({ success: false, message: err.message });
        } else {
          socket.emit("error", { message: err.message });
        }
      }
    });

    // ─── EDIT MESSAGE ────────────────────────────────────────────────────────
    socket.on("edit_message", async (data, callback) => {
      try {
        const { messageId, newText } = data;
        if (!messageId || !newText?.trim()) {
          throw new Error("messageId and newText are required");
        }

        const msg = await ChatMessage.findById(messageId);
        if (!msg) throw new Error("Message not found");

        if (msg.sender.id.toString() !== userId) {
          throw new Error("You can only edit your own messages");
        }

        if (msg.isDeleted) {
          throw new Error("Cannot edit a deleted message");
        }

        // Save edit history
        msg.editHistory.push({
          text: msg.text,
          editedAt: new Date(),
        });
        msg.text = newText.trim();
        msg.isEdited = true;
        msg.editedAt = new Date();
        await msg.save();

        // Update conversation preview if this was the last message
        const conversation = await Conversation.findById(msg.conversation);
        if (conversation && conversation.lastMessage?.toString() === msg._id.toString()) {
          conversation.lastMessageText = newText.trim();
          await conversation.save();
        }

        // Broadcast to conversation room
        io.to(`conversation:${msg.conversation}`).emit("message_edited", {
          messageId: msg._id,
          conversationId: msg.conversation,
          newText: msg.text,
          isEdited: true,
          editedAt: msg.editedAt,
        });

        if (callback) callback({ success: true, data: msg });
      } catch (err) {
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // ─── DELETE MESSAGE (WhatsApp style: everyone or for me) ─────────────────
    socket.on("delete_message", async (data, callback) => {
      try {
        const { messageId, deleteType = "everyone" } = data; // 'everyone' or 'for_me'
        if (!messageId) throw new Error("messageId is required");

        const msg = await ChatMessage.findById(messageId);
        if (!msg) throw new Error("Message not found");

        if (deleteType === "everyone") {
          if (msg.sender.id.toString() !== userId) {
            throw new Error("You can only delete your own messages for everyone");
          }

          msg.isDeleted = true;
          msg.deletedForEveryone = true;
          msg.deletedAt = new Date();
          msg.deletedBy = user.id;
          msg.text = "This message was deleted";
          msg.attachments = [];
          await msg.save();

          // Update conversation lastMessage preview if needed
          const conversation = await Conversation.findById(msg.conversation);
          if (conversation && conversation.lastMessage?.toString() === msg._id.toString()) {
            conversation.lastMessageText = "This message was deleted";
            await conversation.save();
          }

          // Broadcast to conversation room
          io.to(`conversation:${msg.conversation}`).emit("message_deleted", {
            messageId: msg._id,
            conversationId: msg.conversation,
            deletedForEveryone: true,
            deletedBy: user.id,
            deletedAt: msg.deletedAt,
            text: "This message was deleted",
          });
        } else {
          // Delete for me
          if (!msg.deletedForUsers.includes(user.id)) {
            msg.deletedForUsers.push(user.id);
            await msg.save();
          }

          // Acknowledge to caller only
          socket.emit("message_deleted_for_me", {
            messageId: msg._id,
            conversationId: msg.conversation,
          });
        }

        if (callback) callback({ success: true, messageId: msg._id, deleteType });
      } catch (err) {
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // ─── MARK MESSAGES AS READ (Double Blue Ticks) ───────────────────────────
    socket.on("mark_read", async (data, callback) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        // Reset unread count for current user
        if (user.role === "Admin") {
          conversation.unreadCountAdmin = 0;
        } else {
          conversation.unreadCountTrainer = 0;
        }
        await conversation.save();

        // Update all unread messages sent to current user in this conversation
        const readAt = new Date();
        const updateResult = await ChatMessage.updateMany(
          {
            conversation: conversationId,
            "recipient.id": user.id,
            status: { $ne: "read" },
          },
          {
            $set: {
              status: "read",
              readAt,
            },
          }
        );

        // Mark associated notifications as read
        await ChatNotification.updateMany(
          {
            conversation: conversationId,
            recipientId: user.id,
            isRead: false,
          },
          { $set: { isRead: true } }
        );

        // Broadcast read receipt to conversation room (so sender gets double blue ticks)
        io.to(`conversation:${conversationId}`).emit("messages_read", {
          conversationId,
          readerId: userId,
          readAt,
          count: updateResult.modifiedCount,
        });

        if (callback) callback({ success: true, count: updateResult.modifiedCount });
      } catch (err) {
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // ─── TYPING INDICATOR ────────────────────────────────────────────────────
    socket.on("typing_start", (data) => {
      const { conversationId } = data;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_typing", {
          conversationId,
          userId,
          userName: user.name,
          isTyping: true,
        });
      }
    });

    socket.on("typing_stop", (data) => {
      const { conversationId } = data;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_typing", {
          conversationId,
          userId,
          userName: user.name,
          isTyping: false,
        });
      }
    });

    // ─── VOICE RECORDING INDICATOR ───────────────────────────────────────────
    socket.on("record_voice_start", (data) => {
      const { conversationId } = data;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_recording", {
          conversationId,
          userId,
          userName: user.name,
          isRecording: true,
        });
      }
    });

    socket.on("record_voice_stop", (data) => {
      const { conversationId } = data;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_recording", {
          conversationId,
          userId,
          userName: user.name,
          isRecording: false,
        });
      }
    });

    // ─── DISCONNECT ──────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      if (onlineUsers.has(userId)) {
        const userSockets = onlineUsers.get(userId);
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          // Broadcast offline status
          io.emit("user_status", {
            userId,
            userType: user.role,
            isOnline: false,
            lastSeen: new Date(),
          });
        }
      }
    });
  });

  return io;
};

/**
 * Access the Socket.io instance from REST controllers
 */
const getIO = () => io;

/**
 * Helper to check if a specific user is currently online
 */
const isUserOnline = (userId) => {
  return onlineUsers.has(userId.toString()) && onlineUsers.get(userId.toString()).size > 0;
};

module.exports = {
  initChatSocket,
  getIO,
  isUserOnline,
};
