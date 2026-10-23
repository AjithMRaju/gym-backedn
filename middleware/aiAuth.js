/**
 * aiAuth.js - Middleware for AI Subscription Access Control & Rate Limiting
 */

const AiSubscription = require("../models/AiSubscription");
const AssistantMessage = require("../models/AssistantMessage");

// In-memory sliding window cache for user hourly rate limiting
// Key: userId -> Array of timestamps (ms)
const userRequestWindows = new Map();

/**
 * Standard error response helper.
 */
function sendError(res, statusCode, code, message, details = {}) {
  return res.status(statusCode).json({
    error: {
      code,
      message,
      details,
    },
  });
}

/**
 * Require valid AI subscription or unexpired trial.
 * Applies to all /ai/assistant/* endpoints.
 */
async function requireAiSubscription(req, res, next) {
  try {
    if (!req.admin) {
      return sendError(res, 401, "UNAUTHORIZED", "Authentication required");
    }

    const userId = req.admin._id;
    const filter = [{ userId }];
    if (req.admin.gymId && req.admin.gymId !== "default") {
      filter.push({ gymId: req.admin.gymId });
    }

    // Lookup subscription by userId or non-default gymId
    const subscription = await AiSubscription.findOne({
      $or: filter,
    }).sort({ createdAt: -1 });

    const now = new Date();
    let hasAccess = false;

    if (subscription) {
      if (subscription.status === "active") {
        hasAccess = true;
      } else if (subscription.status === "trialing") {
        if (subscription.trialEndsAt && new Date(subscription.trialEndsAt) > now) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return sendError(
        res,
        402,
        "AI_PLAN_REQUIRED",
        "An active AI subscription or valid trial is required to access the AI assistant."
      );
    }

    req.aiSubscription = subscription;
    next();
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
}

/**
 * Hourly user rate limiter: 30 requests per hour.
 * Monthly gym quota limiter: configurable via AI_MONTHLY_QUOTA (default 500).
 */
async function aiRateLimiter(req, res, next) {
  try {
    const userId = req.admin?._id?.toString();
    const gymId = req.admin?.gymId || "default";
    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    // 1. User Hourly Rate Limit (30 req/hr)
    if (userId) {
      const timestamps = (userRequestWindows.get(userId) || []).filter(
        (ts) => now - ts < ONE_HOUR_MS
      );

      if (timestamps.length >= 30) {
        const oldest = timestamps[0];
        const retryAfterSeconds = Math.max(1, Math.ceil((oldest + ONE_HOUR_MS - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return sendError(
          res,
          429,
          "RATE_LIMITED",
          `You have exceeded the rate limit of 30 requests per hour. Please try again later.`,
          { retryAfter: retryAfterSeconds }
        );
      }

      timestamps.push(now);
      userRequestWindows.set(userId, timestamps);
    }

    // 2. Gym Monthly Quota Check
    const monthlyQuota = parseInt(process.env.AI_MONTHLY_QUOTA || "500", 10);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthCount = await AssistantMessage.countDocuments({
      gymId,
      role: "user",
      createdAt: { $gte: startOfMonth },
    });

    if (monthCount >= monthlyQuota) {
      res.setHeader("Retry-After", "3600");
      return sendError(
        res,
        429,
        "QUOTA_EXCEEDED",
        "Monthly AI request quota for this gym has been reached.",
        { monthlyQuota, currentCount: monthCount }
      );
    }

    next();
  } catch (err) {
    return sendError(res, 500, "SERVER_ERROR", err.message);
  }
}

module.exports = {
  sendError,
  requireAiSubscription,
  aiRateLimiter,
};
