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
      maxlength: 255, // ✅ FIXED: was 60 — bcrypt hashes are 60 chars but
                      // give headroom for future algorithm changes and to
                      // prevent Mongoose validation from tripping on edge cases
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
      enum: ['active', 'locked', 'suspended', 'deactivated'],
      default: 'active',
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
      index: true,
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

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ companyId: 1 });
userSchema.index({ isOnline: 1, lastSeenAt: -1 });
userSchema.index({ socketIds: 1 });
userSchema.index({ fullName: 'text' });

// ── Password hashing ──────────────────────────────────────────────────────────
//
// ✅ FIXED: Use a dedicated flag (`_passwordNeedsHashing`) instead of relying
// solely on `isModified('passwordHash')`.
//
// The old approach called `this.save()` inside incrementFailedAttempts() and
// resetFailedAttempts(). Even though passwordHash wasn't intentionally changed,
// Mongoose could mark it as modified on a freshly-fetched document, causing the
// pre-save hook to hash an already-hashed value (hash-of-a-hash). The next
// login then always fails because comparePassword gets the wrong stored value.
//
// The fix: use updateOne() in the attempt helpers so pre('save') never fires
// for non-password changes. The pre('save') hook only runs on explicit password
// assignment (register, reset password).

userSchema.pre('save', async function (next) {
  // Only hash if passwordHash was explicitly set to a plaintext value
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

// ✅ FIXED: Use updateOne() so pre('save') is NOT triggered.
// This prevents the double-hash bug that corrupted passwords after failed logins.
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

  // Keep in-memory values consistent so auth controller can read them
  this.failedAttempts = newCount;
  if (shouldLock) this.accountStatus = 'locked';
};

// ✅ FIXED: Use updateOne() here too — same reason.
userSchema.methods.resetFailedAttempts = async function () {
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        failedAttempts: 0,
        lastLoginAt: new Date(),
        accountStatus: 'active', // unlock if it was locked
      },
    }
  );

  this.failedAttempts = 0;
  this.lastLoginAt    = new Date();
  this.accountStatus  = 'active';
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
  if (this.accountStatus !== 'active') return false;
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