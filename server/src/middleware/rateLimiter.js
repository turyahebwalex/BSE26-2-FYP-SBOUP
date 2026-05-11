const rateLimit = require('express-rate-limit');

// Endpoints the mobile app legitimately polls frequently (every 30s)
// and which do trivial work — exempting them keeps the budget for the
// expensive routes (CV / learning / matching). The auth limiter still
// covers /api/auth/* below, so this is not an auth-bypass.
const POLLING_EXEMPT = new Set([
  '/messages/unread-count',
  '/notifications/unread-count',
]);

// Global API limiter. Defaults raised from 100/15min — that was ~6 req/min
// per IP, well below what a single dashboard mount + polling produces on a
// modern mobile app. New default is 1000/15min (~67 req/min sustained,
// with headroom for navigation bursts). All teammates on a NAT share a
// budget, so leave room.
//
// Override per environment with RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS.
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip cheap pollers so they don't crowd out the real workload.
  skip: (req) => {
    const url = req.originalUrl || req.url || '';
    return Array.from(POLLING_EXEMPT).some((p) => url.includes(p));
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again later.' },
});

module.exports = { apiLimiter, authLimiter };
