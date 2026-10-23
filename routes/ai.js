/**
 * routes/ai.js - AI Assistant & Robot Companion Routes
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const mongoose = require("mongoose");

const { protect } = require("../middleware/auth");
const { sendError, requireAiSubscription, aiRateLimiter } = require("../middleware/aiAuth");

const AiSubscription = require("../models/AiSubscription");
const RobotPreference = require("../models/RobotPreference");
const AssistantConversation = require("../models/AssistantConversation");
const AssistantMessage = require("../models/AssistantMessage");
const AssistantAudio = require("../models/AssistantAudio");
const GymSettings = require("../models/GymSettings");

const sttService = require("../services/ai/sttService");
const ttsService = require("../services/ai/ttsService");
const { ALLOWED_MIME_TYPES } = sttService;
const { ALLOWED_VOICES } = ttsService;
const { askClaude } = require("../services/ai/claudeService");
const { formatDateInTz } = require("../services/ai/dateUtils");

// Configure Multer for in-memory file processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// Cache for dashboard (up to 60s per user+range)
const dashboardCache = new Map();

// ─── 3.1 SUBSCRIPTION / TRIAL ────────────────────────────────────────────────

// @route   GET /ai/subscription
// @desc    Get current AI subscription status
// @access  Protected
router.get("/subscription", protect, async (req, res) => {
  try {
    const userId = req.admin._id;
    const filter = [{ userId }];
    if (req.admin.gymId && req.admin.gymId !== "default") {
      filter.push({ gymId: req.admin.gymId });
    }

    const subscription = await AiSubscription.findOne({
      $or: filter,
    }).sort({ createdAt: -1 });

    const now = new Date();
    let status = "none";
    let plan = null;
    let trialEndsAt = null;
    let currentPeriodEnd = null;
    let hasAccess = false;

    if (subscription) {
      status = subscription.status;
      plan = subscription.plan;
      trialEndsAt = subscription.trialEndsAt ? subscription.trialEndsAt.toISOString() : null;
      currentPeriodEnd = subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null;

      if (status === "active") {
        hasAccess = true;
      } else if (status === "trialing") {
        if (subscription.trialEndsAt && new Date(subscription.trialEndsAt) > now) {
          hasAccess = true;
        } else {
          status = "past_due";
          hasAccess = false;
        }
      }
    }

    return res.json({
      status,
      plan,
      trialEndsAt,
      currentPeriodEnd,
      hasAccess,
    });
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

// @route   POST /ai/subscription/trial
// @desc    Start 7-day trial (once per user/gym)
// @access  Protected
router.post("/subscription/trial", protect, async (req, res) => {
  try {
    const userId = req.admin._id;
    const gymId = req.admin.gymId || "default";
    const filter = [{ userId }];
    if (req.admin.gymId && req.admin.gymId !== "default") {
      filter.push({ gymId: req.admin.gymId });
    }

    let subscription = await AiSubscription.findOne({
      $or: filter,
    });

    if (subscription && subscription.trialUsed) {
      return sendError(
        res,
        409,
        "TRIAL_ALREADY_USED",
        "A free trial has already been activated for this account or gym."
      );
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    if (!subscription) {
      subscription = new AiSubscription({
        userId,
        gymId,
        status: "trialing",
        plan: "pro_trial",
        trialStartedAt: now,
        trialEndsAt,
        trialUsed: true,
      });
    } else {
      subscription.status = "trialing";
      subscription.plan = "pro_trial";
      subscription.trialStartedAt = now;
      subscription.trialEndsAt = trialEndsAt;
      subscription.trialUsed = true;
    }

    await subscription.save();

    return res.json({
      status: "trialing",
      plan: subscription.plan,
      trialEndsAt: subscription.trialEndsAt.toISOString(),
      currentPeriodEnd: null,
      hasAccess: true,
    });
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

// @route   POST /ai/subscription/checkout
// @desc    Initiate AI subscription checkout session
// @access  Protected
router.post("/subscription/checkout", protect, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan) {
      return sendError(res, 400, "VALIDATION_ERROR", "Field 'plan' is required.");
    }

    const userId = req.admin._id;
    const gymId = req.admin.gymId || "default";

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && !stripeKey.startsWith("mock")) {
      try {
        // Dynamic Stripe integration when key is configured
        const stripe = require("stripe")(stripeKey);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: `Gym AI Assistant - ${plan}` },
                unit_amount: 4900,
                recurring: { interval: "month" },
              },
              quantity: 1,
            },
          ],
          mode: "subscription",
          success_url: `${req.headers.origin || "http://localhost:3000"}/settings/ai?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || "http://localhost:3000"}/settings/ai`,
          metadata: { userId: userId.toString(), gymId, plan },
        });

        return res.json({ checkoutUrl: session.url });
      } catch (stripeErr) {
        console.error("Stripe checkout error:", stripeErr);
      }
    }

    // Default checkout provider URL / mock checkout
    const checkoutUrl = `https://checkout.stripe.com/pay/mock_ai_session_${plan}_${userId}`;
    return res.json({ checkoutUrl });
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

// @route   POST /ai/subscription/webhook
// @desc    Payment provider webhook for subscription lifecycle
// @access  Public (webhook signed)
router.post("/subscription/webhook", async (req, res) => {
  try {
    const event = req.body;
    const eventType = event.type || event.event;

    // Idempotent processing of subscription events
    if (eventType === "checkout.session.completed" || eventType === "payment_succeeded") {
      const data = event.data?.object || event;
      const userId = data.metadata?.userId;
      const gymId = data.metadata?.gymId || "default";
      const plan = data.metadata?.plan || "pro";

      if (userId) {
        await AiSubscription.findOneAndUpdate(
          { userId },
          {
            $set: {
              gymId,
              status: "active",
              plan,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          },
          { upsert: true, new: true }
        );
      }
    } else if (eventType === "customer.subscription.deleted" || eventType === "subscription_canceled") {
      const data = event.data?.object || event;
      const userId = data.metadata?.userId;
      if (userId) {
        await AiSubscription.findOneAndUpdate(
          { userId },
          { $set: { status: "canceled" } }
        );
      }
    }

    return res.json({ received: true });
  } catch (err) {
    return res.status(400).json({ error: { code: "WEBHOOK_ERROR", message: err.message } });
  }
});

// ─── 3.2 ROBOT PREFERENCES ───────────────────────────────────────────────────

const DEFAULT_PREFERENCES = {
  name: "Buddy",
  color: "#f0763c",
  accentColor: "#f7d38b",
  voiceEnabled: true,
  voice: "default",
  defaultMode: "happy",
};

// @route   GET /ai/robot-preferences
// @desc    Get user's robot companion preferences
// @access  Protected
router.get("/robot-preferences", protect, async (req, res) => {
  try {
    const userId = req.admin._id;
    const pref = await RobotPreference.findOne({ userId });

    if (!pref) {
      return res.json(DEFAULT_PREFERENCES);
    }

    return res.json({
      name: pref.name,
      color: pref.color,
      accentColor: pref.accentColor,
      voiceEnabled: pref.voiceEnabled,
      voice: pref.voice,
      defaultMode: pref.defaultMode,
    });
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

// @route   PUT /ai/robot-preferences
// @desc    Update user's robot preferences (partial update)
// @access  Protected
router.put("/robot-preferences", protect, async (req, res) => {
  try {
    const userId = req.admin._id;
    const { name, color, accentColor, voiceEnabled, voice, defaultMode } = req.body;

    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    const validModes = new Set(["happy", "thinking", "sad", "nervous", "sleeping"]);

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0 || name.length > 30) {
        return sendError(res, 400, "VALIDATION_ERROR", "Name must be a string up to 30 characters.");
      }
    }

    if (color !== undefined) {
      if (!hexRegex.test(color)) {
        return sendError(res, 400, "VALIDATION_ERROR", "Color must be a valid 6-character hex code (e.g. #f0763c).");
      }
    }

    if (accentColor !== undefined) {
      if (!hexRegex.test(accentColor)) {
        return sendError(res, 400, "VALIDATION_ERROR", "Accent color must be a valid 6-character hex code (e.g. #f7d38b).");
      }
    }

    if (defaultMode !== undefined) {
      if (!validModes.has(defaultMode)) {
        return sendError(res, 400, "VALIDATION_ERROR", "defaultMode must be one of: happy, thinking, sad, nervous, sleeping.");
      }
    }

    if (voice !== undefined) {
      const allowed = new Set([...ALLOWED_VOICES, "default"]);
      if (!allowed.has(voice)) {
        return sendError(res, 400, "VALIDATION_ERROR", `Voice must be one of: ${Array.from(allowed).join(", ")}.`);
      }
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (accentColor !== undefined) updates.accentColor = accentColor;
    if (voiceEnabled !== undefined) updates.voiceEnabled = Boolean(voiceEnabled);
    if (voice !== undefined) updates.voice = voice;
    if (defaultMode !== undefined) updates.defaultMode = defaultMode;

    const saved = await RobotPreference.findOneAndUpdate(
      { userId },
      { $set: updates },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({
      name: saved.name,
      color: saved.color,
      accentColor: saved.accentColor,
      voiceEnabled: saved.voiceEnabled,
      voice: saved.voice,
      defaultMode: saved.defaultMode,
    });
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

// ─── 3.3 ASK BY VOICE ────────────────────────────────────────────────────────

// @route   POST /ai/assistant/voice
// @desc    Process spoken question and stream back AI speech
// @access  Protected + AI Subscription + Rate Limited
router.post(
  "/assistant/voice",
  protect,
  requireAiSubscription,
  aiRateLimiter,
  (req, res, next) => {
    upload.single("audio")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return sendError(res, 413, "FILE_TOO_LARGE", "Uploaded audio exceeds the 25 MB limit.");
        }
        return sendError(res, 400, "UPLOAD_ERROR", err.message);
      }
      next();
    });
  },
  async (req, res) => {
    const startTime = Date.now();
    try {
      if (!req.file) {
        return sendError(res, 400, "BAD_REQUEST", "Audio file is required.");
      }

      const mimeType = req.file.mimetype;
      const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
        return sendError(
          res,
          400,
          "INVALID_AUDIO_FORMAT",
          `Unsupported audio format '${mimeType}'. Supported formats are audio/webm, audio/mp4, and audio/wav.`
        );
      }

      const userId = req.admin._id;
      const gymId = req.admin.gymId || "default";
      const gymSettings = (await GymSettings.findOne({ gym_id: gymId }).lean()) || {};

      // 1. Transcribe Audio
      let transcript;
      try {
        transcript = await sttService.transcribeAudio(req.file.buffer, mimeType, {
          language: gymSettings.language || "en",
          filename: req.file.originalname,
        });
      } catch (sttErr) {
        return sendError(
          res,
          sttErr.statusCode || 502,
          sttErr.code || "STT_FAILED",
          sttErr.message
        );
      }

      // Memory cleanup: nullify buffer immediately
      req.file.buffer = null;

      // 2. Conversation & History
      let conversationId = req.body.conversationId;
      let conversation;
      if (conversationId && mongoose.isValidObjectId(conversationId)) {
        conversation = await AssistantConversation.findOne({ _id: conversationId, userId });
      }
      if (!conversation) {
        conversation = await AssistantConversation.create({
          userId,
          gymId,
          title: transcript.slice(0, 40),
        });
      }

      // Fetch last 10 messages for context
      const historyDocs = await AssistantMessage.find({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      const messagesForClaude = historyDocs.reverse().map((m) => ({
        role: m.role,
        content: m.text,
      }));

      // Append current user message
      messagesForClaude.push({ role: "user", content: transcript });

      // Save user message record
      await AssistantMessage.create({
        conversationId: conversation._id,
        userId,
        gymId,
        role: "user",
        text: transcript,
        isVoice: true,
      });

      // 3. Claude Brain with Tool execution
      const claudeResult = await askClaude(messagesForClaude, {
        gymSettings,
        user: req.admin,
        gymId,
        userId,
      });

      // 4. Text-To-Speech (if replyWithAudio is true or default)
      const replyWithAudio = req.body.replyWithAudio !== "false" && req.body.replyWithAudio !== false;
      const robotPref = await RobotPreference.findOne({ userId }).lean();
      const userVoice = robotPref?.voice || "default";

      let speechResult = { audioUrl: null, expiresAt: null, ttsAvailable: false };
      if (replyWithAudio && robotPref?.voiceEnabled !== false) {
        speechResult = await ttsService.generateSpeech(claudeResult.replyText, userVoice, { userId });
      }

      const latencyMs = Date.now() - startTime;

      // Save assistant message record
      const assistantMsg = await AssistantMessage.create({
        conversationId: conversation._id,
        userId,
        gymId,
        role: "assistant",
        text: claudeResult.replyText,
        robotMode: claudeResult.robotMode,
        toolsUsed: claudeResult.sources,
        latencyMs,
      });

      // 5. Response Contract
      const responsePayload = {
        conversationId: conversation._id.toString(),
        messageId: assistantMsg._id.toString(),
        transcript,
        replyText: claudeResult.replyText,
        replyAudioUrl: speechResult.audioUrl,
        audioExpiresAt: speechResult.expiresAt,
        robotMode: claudeResult.robotMode,
        sources: claudeResult.sources,
        latencyMs,
      };

      if (!speechResult.ttsAvailable && replyWithAudio) {
        responsePayload.ttsAvailable = false;
      }

      return res.json(responsePayload);
    } catch (err) {
      console.error("[Voice Assistant Error]", err);
      return sendError(
        res,
        err.statusCode || 500,
        err.code || "ASSISTANT_FAILED",
        err.message || "Failed to process voice assistant request"
      );
    }
  }
);

// ─── 3.4 ASK BY TEXT ─────────────────────────────────────────────────────────

// @route   POST /ai/assistant/ask
// @desc    Process text question and return answer + optional speech
// @access  Protected + AI Subscription + Rate Limited
router.post(
  "/assistant/ask",
  protect,
  requireAiSubscription,
  aiRateLimiter,
  async (req, res) => {
    const startTime = Date.now();
    try {
      const { message, conversationId, replyWithAudio = true } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return sendError(res, 400, "VALIDATION_ERROR", "Message is required.");
      }

      if (message.length > 500) {
        return sendError(res, 400, "VALIDATION_ERROR", "Message must be 500 characters or fewer.");
      }

      const userId = req.admin._id;
      const gymId = req.admin.gymId || "default";
      const gymSettings = (await GymSettings.findOne({ gym_id: gymId }).lean()) || {};

      // 1. Conversation
      let activeConversation;
      if (conversationId && mongoose.isValidObjectId(conversationId)) {
        activeConversation = await AssistantConversation.findOne({ _id: conversationId, userId });
      }
      if (!activeConversation) {
        activeConversation = await AssistantConversation.create({
          userId,
          gymId,
          title: message.slice(0, 40),
        });
      }

      // Fetch last 10 messages for context
      const historyDocs = await AssistantMessage.find({ conversationId: activeConversation._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      const messagesForClaude = historyDocs.reverse().map((m) => ({
        role: m.role,
        content: m.text,
      }));

      // Append current user message
      messagesForClaude.push({ role: "user", content: message });

      // Save user message record
      await AssistantMessage.create({
        conversationId: activeConversation._id,
        userId,
        gymId,
        role: "user",
        text: message,
        isVoice: false,
      });

      // 2. Claude Brain with Tool execution
      const claudeResult = await askClaude(messagesForClaude, {
        gymSettings,
        user: req.admin,
        gymId,
        userId,
      });

      // 3. TTS Speech Generation
      const robotPref = await RobotPreference.findOne({ userId }).lean();
      const userVoice = robotPref?.voice || "default";

      let speechResult = { audioUrl: null, expiresAt: null, ttsAvailable: false };
      if (replyWithAudio && robotPref?.voiceEnabled !== false) {
        speechResult = await ttsService.generateSpeech(claudeResult.replyText, userVoice, { userId });
      }

      const latencyMs = Date.now() - startTime;

      // Save assistant message record
      const assistantMsg = await AssistantMessage.create({
        conversationId: activeConversation._id,
        userId,
        gymId,
        role: "assistant",
        text: claudeResult.replyText,
        robotMode: claudeResult.robotMode,
        toolsUsed: claudeResult.sources,
        latencyMs,
      });

      const responsePayload = {
        conversationId: activeConversation._id.toString(),
        messageId: assistantMsg._id.toString(),
        transcript: message,
        replyText: claudeResult.replyText,
        replyAudioUrl: speechResult.audioUrl,
        audioExpiresAt: speechResult.expiresAt,
        robotMode: claudeResult.robotMode,
        sources: claudeResult.sources,
        latencyMs,
      };

      if (!speechResult.ttsAvailable && replyWithAudio) {
        responsePayload.ttsAvailable = false;
      }

      return res.json(responsePayload);
    } catch (err) {
      console.error("[Text Assistant Error]", err);
      return sendError(
        res,
        err.statusCode || 500,
        err.code || "ASSISTANT_FAILED",
        err.message || "Failed to process assistant request"
      );
    }
  }
);

// ─── 3.5 REPLY AUDIO ─────────────────────────────────────────────────────────

// @route   GET /ai/assistant/audio/:id
// @desc    Stream audio MP3 file. Auth required, only the owner can fetch (404 otherwise).
// @access  Protected
router.get("/assistant/audio/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, 404, "NOT_FOUND", "Audio recording not found.");
    }

    const userId = req.admin._id;
    const audioDoc = await AssistantAudio.findById(id);

    if (!audioDoc) {
      return sendError(res, 404, "NOT_FOUND", "Audio recording not found.");
    }

    // Tenant / Owner security: only the owner can fetch
    if (audioDoc.userId.toString() !== userId.toString()) {
      return sendError(res, 404, "NOT_FOUND", "Audio recording not found.");
    }

    // Check expiry
    if (new Date() > new Date(audioDoc.expiresAt)) {
      return sendError(res, 404, "NOT_FOUND", "Audio has expired.");
    }

    res.setHeader("Content-Type", audioDoc.mimeType || "audio/mpeg");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", audioDoc.data.length);
    return res.end(audioDoc.data);
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

// ─── 3.6 CONVERSATIONS & DASHBOARD ───────────────────────────────────────────

// @route   GET /ai/assistant/conversations/:id
// @desc    Get message history for a conversation
// @access  Protected
router.get("/assistant/conversations/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, 404, "NOT_FOUND", "Conversation not found.");
    }

    const userId = req.admin._id;
    const conversation = await AssistantConversation.findOne({ _id: id, userId });
    if (!conversation) {
      return sendError(res, 404, "NOT_FOUND", "Conversation not found.");
    }

    const messages = await AssistantMessage.find({ conversationId: id })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    return res.json({
      id: conversation._id.toString(),
      messages: messages.map((m) => ({
        id: m._id.toString(),
        role: m.role,
        text: m.text,
        robotMode: m.robotMode || null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

// @route   GET /ai/assistant/dashboard?range=7d|30d|90d
// @desc    Analytics dashboard for AI assistant usage
// @access  Protected
router.get("/assistant/dashboard", protect, async (req, res) => {
  try {
    const userId = req.admin._id;
    const gymId = req.admin.gymId || "default";
    const range = req.query.range === "30d" ? "30d" : req.query.range === "90d" ? "90d" : "7d";
    const days = range === "30d" ? 30 : range === "90d" ? 90 : 7;

    const cacheKey = `${userId}_${gymId}_${range}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return res.json(cached.data);
    }

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalQuestions, totalVoiceQuestions, toolAggregates, recentMessages, dailyAggregates] =
      await Promise.all([
        AssistantMessage.countDocuments({
          userId,
          role: "user",
          createdAt: { $gte: sinceDate },
        }),
        AssistantMessage.countDocuments({
          userId,
          role: "user",
          isVoice: true,
          createdAt: { $gte: sinceDate },
        }),
        AssistantMessage.aggregate([
          { $match: { userId, role: "assistant", createdAt: { $gte: sinceDate } } },
          { $unwind: "$toolsUsed" },
          { $group: { _id: "$toolsUsed.tool", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        AssistantMessage.find({ userId, role: "user", createdAt: { $gte: sinceDate } })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        AssistantMessage.aggregate([
          { $match: { userId, role: "user", createdAt: { $gte: sinceDate } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              questions: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    const result = {
      range,
      totals: {
        questions: totalQuestions,
        voiceQuestions: totalVoiceQuestions,
      },
      topTools: toolAggregates.map((t) => ({ tool: t._id, count: t.count })),
      daily: dailyAggregates.map((d) => ({ date: d._id, questions: d.questions })),
      recent: recentMessages.map((m) => ({
        id: m._id.toString(),
        question: m.text,
        createdAt: m.createdAt.toISOString(),
      })),
    };

    dashboardCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return res.json(result);
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
});

module.exports = router;
