const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Statuses that should be blocked from accessing the platform.
// 'warned' is intentionally excluded — a warning is a notification only;
// the user remains fully active until a suspension or ban is applied.
const BLOCKED_STATUSES = ['suspended', 'banned', 'locked'];

/**
 * Authenticate JWT token from Authorization header
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-passwordHash').populate('companyId');
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    // Check if user account is blocked
    if (BLOCKED_STATUSES.includes(user.accountStatus)) {
      return res.status(403).json({ error: `Account is ${user.accountStatus}.` });
    }

    // Check if employer's company is banned/suspended
    if (user.role === 'employer' && user.companyId && BLOCKED_STATUSES.includes(user.companyId.moderationStatus)) {
      return res.status(403).json({ error: `Company account is ${user.companyId.moderationStatus}.` });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    logger.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/**
 * Role-Based Access Control (RBAC) middleware
 * Usage: authorize('admin', 'employer')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};

/**
 * Optional authentication - attaches user if token present, continues if not
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-passwordHash');
    }
  } catch (error) {
    // Silently continue without user
  }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };