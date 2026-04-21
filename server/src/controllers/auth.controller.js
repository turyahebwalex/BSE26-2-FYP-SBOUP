const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Company = require('../models/Company');
const LoginAttempt = require('../models/LoginAttempt');
const logger = require('../utils/logger');
const emailService = require('../services/email.service');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user._id, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
  return { accessToken, refreshToken };
};

const logAttempt = async (req, payload) => {
  try {
    await LoginAttempt.create({
      ipAddress: (req.headers['x-forwarded-for'] || req.ip || '').toString().slice(0, 60),
      userAgent: (req.headers['user-agent'] || '').toString().slice(0, 500),
      ...payload,
    });
  } catch (err) {
    // Never let audit logging break auth flow
    logger.warn('LoginAttempt log failed:', err.message);
  }
};

/**
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, fullName, role, phoneNumber, companyName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    let companyId = null;
    if (role === 'employer' && companyName) {
      const existingCompany = await Company.findOne({ name: companyName });
      const company = existingCompany || (await Company.create({ name: companyName, contactEmail: email }));
      companyId = company._id;
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      email,
      passwordHash: password,
      fullName,
      role: role || 'skilled_worker',
      phoneNumber,
      companyId,
      emailVerificationToken: verificationToken,
    });

    await emailService.sendVerificationEmail(user, verificationToken);
    logger.info(`New user registered: ${email} (${role})`);

    const tokens = generateTokens(user);
    res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      user: user.toJSON(),
      ...tokens,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed.' });
  }
};

/**
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      await logAttempt(req, { emailAttempted: email, success: false, reason: 'unknown_email' });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.accountStatus === 'locked') {
      await logAttempt(req, { userId: user._id, emailAttempted: email, success: false, reason: 'account_locked' });
      return res.status(403).json({ error: 'Account is locked. Contact support.' });
    }
    if (user.accountStatus === 'deactivated' || user.accountStatus === 'suspended') {
      await logAttempt(req, {
        userId: user._id, emailAttempted: email, success: false, reason: 'account_deactivated',
      });
      return res.status(403).json({ error: `Account is ${user.accountStatus}.` });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementFailedAttempts();
      await logAttempt(req, { userId: user._id, emailAttempted: email, success: false, reason: 'invalid_credentials' });
      const limit = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
      const remaining = limit - user.failedAttempts;
      return res.status(401).json({
        error: `Invalid email or password.${remaining > 0 ? ` ${remaining} attempts remaining.` : ' Account locked.'}`,
      });
    }

    await user.resetFailedAttempts();
    await logAttempt(req, { userId: user._id, emailAttempted: email, success: true, reason: 'success' });

    const tokens = generateTokens(user);
    res.json({ message: 'Login successful.', user: user.toJSON(), ...tokens });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
};

/**
 * POST /api/auth/refresh
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token.' });

    const user = await User.findById(decoded.id);
    if (!user || user.accountStatus !== 'active') {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }
    res.json(generateTokens(user));
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token.' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.passwordResetExpires = Date.now() + 30 * 60 * 1000;
      await user.save();
      await emailService.sendPasswordResetEmail(user, resetToken);
    }
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request.' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    user.passwordHash = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.failedAttempts = 0;
    if (user.accountStatus === 'locked') user.accountStatus = 'active';
    await user.save();

    res.json({ message: 'Password reset successful.' });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const user = await User.findOne({ emailVerificationToken: req.params.token });
    if (!user) return res.status(400).json({ error: 'Invalid verification token.' });

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();
    res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed.' });
  }
};

exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};

exports.googleCallback = async (req, res) => {
  try {
    const tokens = generateTokens(req.user);
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`
    );
  } catch (error) {
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
  }
};
