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
      maxlength: 60,
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
    passwordResetToken: String,
    passwordResetExpires: Date,
    lastLoginAt: Date,
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ companyId: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  if (this.oauthProvider && this.passwordHash === 'oauth-no-password') return next();
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (this.passwordHash === 'oauth-no-password') return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.incrementFailedAttempts = async function () {
  this.failedAttempts += 1;
  const limit = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
  if (this.failedAttempts >= limit) {
    this.accountStatus = 'locked';
  }
  await this.save();
};

userSchema.methods.resetFailedAttempts = async function () {
  this.failedAttempts = 0;
  this.lastLoginAt = new Date();
  await this.save();
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
