const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Generate JWT tokens
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
  return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register
 * Register new user with email, password, and role
 */
exports.register = async (req, res) => {
  try {
    const { email, password, fullName, role, phoneNumber } = req.body;

    // Check duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Create user (password hashed by pre-save hook)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      email,
      passwordHash: password,
      fullName,
      role: role || 'skilled_worker',
      phoneNumber,
      emailVerificationToken: verificationToken,
    });

    // TODO: Send verification email via SendGrid
    logger.info(`New user registered: ${email} (${role})`);

    res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      user: user.toJSON(),
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed.' });
  }
};

/**
 * POST /api/auth/login
 * Authenticate user and return JWT tokens
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check account lockout
    if (user.accountStatus === 'locked') {
      return res.status(403).json({ error: 'Account is locked. Contact support.' });
    }
    if (user.accountStatus === 'deactivated') {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementFailedAttempts();
      const remaining = 5 - user.failedAttempts;
      return res.status(401).json({
        error: `Invalid email or password. ${remaining > 0 ? remaining + ' attempts remaining.' : 'Account locked.'}`,
      });
    }

    // Reset failed attempts on success
    await user.resetFailedAttempts();

    // Generate tokens
    const tokens = generateTokens(user);

    res.json({
      message: 'Login successful.',
      user: user.toJSON(),
      ...tokens,
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
};

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.accountStatus !== 'active') {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token.' });
  }
};

/**
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: 'If the email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    // TODO: Send password reset email via SendGrid
    logger.info(`Password reset requested for: ${email}`);

    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request.' });
  }
};

/**
 * POST /api/auth/reset-password/:token
 */
exports.resetPassword = async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    user.passwordHash = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.failedAttempts = 0;
    user.accountStatus = 'active';
    await user.save();

    res.json({ message: 'Password reset successful.' });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
};

/**
 * POST /api/auth/verify-email/:token
 */
exports.verifyEmail = async (req, res) => {
  try {
    const user = await User.findOne({ emailVerificationToken: req.params.token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed.' });
  }
};

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};

/**
 * Google OAuth callback
 */
exports.googleCallback = async (req, res) => {
  try {
    const tokens = generateTokens(req.user);
    // Redirect to frontend with tokens
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
  } catch (error) {
    res.redirect(`${process.env.CLIENT_URL}/auth/login?error=oauth_failed`);
  }
};
