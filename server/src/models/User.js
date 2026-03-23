const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
      maxlength: 60,
    },
    role: {
      type: String,
      required: true,
      enum: ['skilled_worker', 'employer', 'admin'],
      default: 'skilled_worker',
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      maxlength: 100,
    },
    phoneNumber: {
      type: String,
      maxlength: 15,
    },
    accountStatus: {
      type: String,
      enum: ['active', 'locked', 'deactivated'],
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
    passwordResetToken: String,
    passwordResetExpires: Date,
    lastLoginAt: Date,
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

// Index for fast lookups
userSchema.index({ email: 1 });
userSchema.index({ role: 1, accountStatus: 1 });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash') || this.oauthProvider) return next();
  if (this.passwordHash === 'oauth-no-password') return next();
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Increment failed attempts and lock if exceeded
userSchema.methods.incrementFailedAttempts = async function () {
  this.failedAttempts += 1;
  if (this.failedAttempts >= 5) {
    this.accountStatus = 'locked';
  }
  await this.save();
};

// Reset failed attempts on successful login
userSchema.methods.resetFailedAttempts = async function () {
  this.failedAttempts = 0;
  this.lastLoginAt = new Date();
  await this.save();
};

// Remove sensitive fields from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
