/**
 * rateLimiter.js – in-memory sliding-window rate limiters for sensitive endpoints.
 *
 * Uses a simple Map-based implementation so there are no extra dependencies.
 * For production deployments behind multiple Node processes, swap with
 * a Redis-backed store (e.g. rate-limiter-flexible with ioredis).
 *
 * Exported limiters:
 *   passwordLimiter  – 5 attempts per 15 minutes per IP
 *   twoFALimiter     – 10 attempts per 15 minutes per IP
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Create a simple rate-limiter middleware.
 *
 * @param {number} maxRequests  Maximum number of requests in the window
 * @param {number} windowMs     Rolling window in ms
 * @param {string} message      Error message when limit exceeded
 */
function createLimiter(maxRequests, windowMs, message) {
  const store = new Map(); // key → { count, resetAt }

  // Prune stale entries every windowMs to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, windowMs).unref();

  return function rateLimiter(req, res, next) {
    const key = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      return res.status(429).json({
        code: "RATE_LIMIT_EXCEEDED",
        message,
        fieldErrors: {},
      });
    }

    next();
  };
}

const passwordLimiter = createLimiter(
  5,
  WINDOW_MS,
  "Too many password-change attempts. Please try again in 15 minutes."
);

const twoFALimiter = createLimiter(
  10,
  WINDOW_MS,
  "Too many 2FA attempts. Please try again in 15 minutes."
);

module.exports = { passwordLimiter, twoFALimiter };
