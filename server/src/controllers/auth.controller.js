const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Company = require('../models/Company');
const LoginAttempt = require('../models/LoginAttempt');
const logger = require('../utils/logger');
const emailService = require('../services/email.service');
const OtpRequest = require('../models/OtpRequest');

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
 * POST /api/auth/google
 * Google OAuth login
 */
exports.googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required.' });
    }

    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;
    
    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google.' });
    }

    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user for Google sign-in
      user = await User.create({
        email,
        fullName: name || email.split('@')[0],
        avatar: picture || null,
        oauthProvider: 'google',
        oauthId: googleId,
        isEmailVerified: true, // Google verified the email
        role: 'skilled_worker', // Default role
        passwordHash: 'oauth-no-password', // Special marker for OAuth users
        accountStatus: 'active',
      });
      logger.info(`New user created via Google OAuth: ${email}`);
    } else {
      // Update existing user's Google info if needed
      if (!user.oauthProvider) {
        user.oauthProvider = 'google';
        user.oauthId = googleId;
        user.isEmailVerified = true;
        await user.save();
        logger.info(`Existing user linked to Google OAuth: ${email}`);
      }
    }

    // Check if user is blocked
    if (user.accountStatus !== 'active') {
      return res.status(403).json({ 
        error: `Account is ${user.accountStatus}. Please contact support.` 
      });
    }

    // Generate tokens
    const tokens = generateTokens(user);
    
    res.json({
      message: 'Google login successful.',
      user: user.toJSON(),
      ...tokens,
    });
  } catch (error) {
    logger.error('Google login error:', error);
    res.status(401).json({ error: 'Google authentication failed. Please try again.' });
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

/**
 * POST /api/auth/forgot-password
 */
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

/**
 * GET /api/auth/verify-email/:token
 */
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

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};

/**
 * GET /api/auth/google/callback
 * Redirect handler for Passport Google OAuth (if you're using Passport)
 */
exports.googleCallback = async (req, res) => {
  // Decode the OAuth `state` we set in the /google route: { platform, redirect }.
  // For mobile we redirect to the app-provided URI (exp://… in Expo Go,
  // skillbridge://… in a dev build) so the WebBrowser session resolves and the
  // app receives the tokens. Web keeps going to CLIENT_URL as before.
  let platform = 'web';
  let mobileRedirect;
  try {
    const decoded = JSON.parse(Buffer.from(req.query.state || '', 'base64').toString('utf8'));
    platform = decoded.platform || 'web';
    mobileRedirect = decoded.redirect;
  } catch (_) {
    // Legacy/plain state (e.g. "mobile") or none — fall back gracefully.
    if (req.query.state === 'mobile') platform = 'mobile';
  }
  const isMobile = platform === 'mobile';
  const redirectBase =
    mobileRedirect || process.env.MOBILE_AUTH_REDIRECT || 'skillbridge://auth/callback';
  const sep = redirectBase.includes('?') ? '&' : '?';

  try {
    const tokens = generateTokens(req.user);
    if (isMobile) {
      return res.redirect(
        `${redirectBase}${sep}token=${tokens.accessToken}&refresh=${tokens.refreshToken}`
      );
    }
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`
    );
  } catch (error) {
    if (isMobile) {
      return res.redirect(`${redirectBase}${sep}error=oauth_failed`);
    }
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
  }
};

// ==================== OTP Routes ====================

/**
 * POST /api/auth/send-otp
 * Send OTP verification code to user's email
 */
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Check if email already registered
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered. Please login.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in database
    await OtpRequest.findOneAndUpdate(
      { email },
      { otp, expiresAt, channel: 'email' },
      { upsert: true, new: true }
    );

    // Send OTP via email
    await emailService.sendOtpEmail(email, otp);
    logger.info(`OTP sent to ${email}`);

    res.json({ success: true, message: 'OTP sent to email.' });
  } catch (error) {
    logger.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
};

/**
 * POST /api/auth/verify-otp
 * Verify OTP and complete registration
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp, userData } = req.body;

    // Validate required fields
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    // Find valid OTP record
    const record = await OtpRequest.findOne({ email, otp });

    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    // Extract user data
    const { fullName, password, role, phoneNumber, companyName } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Handle company creation for employers
    let companyId = null;
    if (role === 'employer' && companyName) {
      const existingCompany = await Company.findOne({ name: companyName });
      const company = existingCompany || (await Company.create({ name: companyName, contactEmail: email }));
      companyId = company._id;
    }

    // Create new user
    const user = await User.create({
      email,
      passwordHash: password,
      fullName,
      role: role || 'skilled_worker',
      phoneNumber: phoneNumber || null,
      companyId,
      isEmailVerified: true, // Email verified via OTP
    });

    // Clean up used OTP
    await OtpRequest.deleteOne({ _id: record._id });
    logger.info(`User registered via email OTP: ${email}`);

    // Generate tokens and send response
    const tokens = generateTokens(user);
    res.status(201).json({
      message: 'Registration successful.',
      user: user.toJSON(),
      ...tokens,
    });
  } catch (error) {
    logger.error(`OTP verification error: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Registration failed.' });
  }
};