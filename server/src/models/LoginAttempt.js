const mongoose = require('mongoose');

/**
 * LoginAttempt (SDD Chapter 4, Table 4.2)
 * Audit trail for every authentication attempt. Used to detect brute
 * force attacks, surface account takeover risk, and drive the
 * 5-failed-attempt lockout rule.
 */
const loginAttemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  emailAttempted: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 255,
  },
  ipAddress: { type: String, maxlength: 64 },
  userAgent: { type: String, maxlength: 500 },
  success: { type: Boolean, required: true },
  reason: {
    type: String,
    enum: [
      'success',
      'invalid_credentials',
      'account_locked',
      'account_deactivated',
      'unknown_email',
      'oauth_linked',
    ],
    default: 'invalid_credentials',
  },
  attemptedAt: { type: Date, default: Date.now, index: true },
});

loginAttemptSchema.index({ userId: 1, attemptedAt: -1 });
loginAttemptSchema.index({ emailAttempted: 1, attemptedAt: -1 });
loginAttemptSchema.index({ ipAddress: 1, attemptedAt: -1 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
