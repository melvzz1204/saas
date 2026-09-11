// src/middlewares/rateLimit.js
// Minimal dependency-free, in-memory rate limiter (fixed window) to protect
// abuse-prone endpoints (registration initiate / verify / resend).
//
// NOTE: state lives in this process's memory. It is correct for a single
// instance. For a horizontally-scaled deployment, back this with a shared store
// (e.g. Redis) instead — the public API here can stay the same.

const buckets = new Map(); // key -> { count, resetAt }

// Periodically drop expired buckets so the map can't grow unbounded.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);
// Don't keep the event loop alive just for the sweeper.
if (typeof sweeper.unref === "function") sweeper.unref();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Build a rate-limiting middleware.
 * @param {object} opts
 * @param {number} opts.windowMs   Window length in ms.
 * @param {number} opts.max        Max requests per key per window.
 * @param {(req)=>string} [opts.keyGenerator]  Defaults to client IP.
 * @param {string} [opts.message]  429 body message.
 */
export function rateLimit({ windowMs, max, keyGenerator, message } = {}) {
  const windowMsSafe = Number(windowMs) || 60_000;
  const maxSafe = Number(max) || 30;
  const keyFn = keyGenerator || ((req) => clientIp(req));
  const msg = message || "Too many requests. Please slow down and try again shortly.";

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = `${req.baseUrl}${req.path}:${keyFn(req)}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMsSafe };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(maxSafe - bucket.count, 0);
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader("X-RateLimit-Limit", String(maxSafe));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (bucket.count > maxSafe) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ success: false, message: msg, retryAfterSeconds: retryAfterSec });
    }
    next();
  };
}

// Exposed for tests so limiter state doesn't leak between cases.
export function __resetRateLimit() {
  buckets.clear();
}
