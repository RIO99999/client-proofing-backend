// Fixed-window, in-memory rate limiter keyed by client IP. Replaces express-rate-limit.
// Sends the same RateLimit-* headers and a 429 with the given JSON body when the limit is hit.
function rateLimit({ windowMs = 60 * 1000, limit = 40, message = { message: 'Too many requests.' } } = {}) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.reset <= now) hits.delete(key);
    }
  }, Math.min(windowMs, 60 * 1000));
  sweep.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = (req.socket && req.socket.remoteAddress) || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const resetSeconds = Math.ceil((entry.reset - now) / 1000);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entry.count > limit) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json(message);
    }
    return next();
  };
}

module.exports = rateLimit;
