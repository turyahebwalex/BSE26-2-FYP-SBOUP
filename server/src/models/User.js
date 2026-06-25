const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User (SDD Chapter 4, Table 4.1)
 * Central identity record. Drives authentication, role-based access
 * (RBAC), and links to Profile (workers) or Company (employers).
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 255,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      maxlength: 255,
      select: true,
    },
    role: {
      type: String,
      required: true,
      enum: ['skilled_worker', 'employer', 'admin'],
      default: 'skilled_worker',
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      maxlength: 100,
    },
    phoneNumber: {
      type: String,
      maxlength: 20,
    },
    accountStatus: {
      type: String,
      // 'warned'  – account is active but has a formal warning on record
      // 'banned'  – permanent ban, cannot log in or use the platform
      enum: ['active', 'locked', 'suspended', 'warned', 'banned'],
      default: 'active',
    },
    // Set by admin when applying a moderation action (warn/suspend/ban).
    // Included in the notification so the user knows the specific reason.
    moderationNote: {
      type: String,
      maxlength: 500,
      default: null,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    oauthProvider: {
      type: String,
      maxlength: 20,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    passwordResetToken:     String,
    passwordResetExpires:   Date,
    lastLoginAt:            Date,

    // ── Messaging ────────────────────────────────────────────────────────────

    avatar: {
      type: String,
      default: null,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    socketIds: [{
      type: String,
    }],
    pushTokens: [{
      type: String,
      trim: true,
    }],
    messagingPreferences: {
      emailNotifications: { type: Boolean, default: true },
      pushNotifications:  { type: Boolean, default: true },
      soundEnabled:       { type: Boolean, default: true },
      readReceipts:       { type: Boolean, default: true },
    },
    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    typingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    typingExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ companyId: 1 });
userSchema.index({ isOnline: 1, lastSeenAt: -1 });
userSchema.index({ socketIds: 1 });
userSchema.index({ fullName: 'text' });

// ── Password hashing ──────────────────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  if (this.oauthProvider && this.passwordHash === 'oauth-no-password') return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ── Instance methods ──────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (this.passwordHash === 'oauth-no-password') return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.incrementFailedAttempts = async function () {
  const limit = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
  const newCount = this.failedAttempts + 1;
  const shouldLock = newCount >= limit;

  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        failedAttempts: newCount,
        ...(shouldLock && { accountStatus: 'locked' }),
      },
    }
  );

  this.failedAttempts = newCount;
  if (shouldLock) this.accountStatus = 'locked';
};

userSchema.methods.resetFailedAttempts = async function () {
  // Only reset status to 'active' if it was 'locked' (login-lock due to failed
  // attempts). Do NOT override admin-applied moderation statuses like 'warned',
  // 'suspended', or 'banned' — those must be lifted by an admin explicitly.
  const moderationStatuses = ['warned', 'suspended', 'banned'];
  const statusUpdate = moderationStatuses.includes(this.accountStatus)
    ? {}
    : { accountStatus: 'active' };

  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        failedAttempts: 0,
        lastLoginAt: new Date(),
        ...statusUpdate,
      },
    }
  );

  this.failedAttempts = 0;
  this.lastLoginAt    = new Date();
  if (!moderationStatuses.includes(this.accountStatus)) {
    this.accountStatus = 'active';
  }
};

// ── Messaging methods ─────────────────────────────────────────────────────────

userSchema.methods.updateOnlineStatus = async function (isOnline, socketId = null) {
  const update = { isOnline, lastSeenAt: new Date() };

  if (socketId) {
    if (isOnline) {
      update.$addToSet = { socketIds: socketId };
    } else {
      update.$pull = { socketIds: socketId };
    }
  }

  await this.constructor.updateOne({ _id: this._id }, update);
  this.isOnline   = isOnline;
  this.lastSeenAt = new Date();
};

userSchema.methods.canReceiveFrom = function (senderId) {
  if (this.blockedUsers.includes(senderId)) return false;
  // 'warned' users are still active on the platform — only hard blocks apply.
  const blockedStatuses = ['suspended', 'banned', 'locked'];
  if (blockedStatuses.includes(this.accountStatus)) return false;
  return true;
};

userSchema.methods.getOnlineStatus = function () {
  return {
    isOnline:          this.isOnline,
    lastSeenAt:        this.lastSeenAt,
    lastSeenFormatted: this.lastSeenAt ? this.getLastSeenFormatted() : null,
  };
};

userSchema.methods.getLastSeenFormatted = function () {
  if (this.isOnline) return 'Online';
  const diffMinutes = Math.floor((Date.now() - this.lastSeenAt) / 60000);
  if (diffMinutes < 1)    return 'Just now';
  if (diffMinutes < 60)   return `${diffMinutes} minutes ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
  return `${Math.floor(diffMinutes / 1440)} days ago`;
};

userSchema.methods.setTyping = async function (toUserId) {
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        typingTo:      toUserId,
        typingExpires: new Date(Date.now() + 3000),
      },
    }
  );

  setTimeout(async () => {
    await this.constructor.updateOne(
      { _id: this._id, typingTo: toUserId },
      { $set: { typingTo: null, typingExpires: null } }
    );
  }, 3000);
};

// ── Virtuals ──────────────────────────────────────────────────────────────────

userSchema.virtual('displayName').get(function () {
  const prefix =
    this.role === 'skilled_worker' ? '👤 '
    : this.role === 'employer'     ? '🏢 '
    : '⚙️ ';
  return prefix + this.fullName;
});

// ── toJSON ────────────────────────────────────────────────────────────────────

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.socketIds;
  delete obj.pushTokens;
  delete obj.typingTo;
  delete obj.typingExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);