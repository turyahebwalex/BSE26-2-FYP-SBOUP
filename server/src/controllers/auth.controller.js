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

// ─── Helper: check company moderation status ───────────────────────────────
const checkCompanyStatus = async (companyIdOrDoc) => {
  if (!companyIdOrDoc) return null;
  const company = typeof companyIdOrDoc === 'object' && companyIdOrDoc.moderationStatus
    ? companyIdOrDoc
    : await Company.findById(companyIdOrDoc);
  if (!company) return null;
  return company.moderationStatus || null;
};

// ─── Helper: check user account status ────────────────────────────────────
const checkUserStatus = (user) => {
  if (user.accountStatus === 'banned') {
    return { blocked: true, message: 'Your account has been banned. Please contact admin@skillbridge.ug.' };
  }
  if (user.accountStatus === 'suspended') {
    return { blocked: true, message: 'Your account has been suspended. Please contact admin@skillbridge.ug.' };
  }
  if (user.accountStatus === 'locked') {
    return { blocked: true, message: 'Account is locked. Contact support.' };
  }
  return { blocked: false };
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
    // We'll create the user first, then company, so we have the userId.
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      email,
      passwordHash: password,
      fullName,
      role: role || 'skilled_worker',
      phoneNumber,
      emailVerificationToken: verificationToken,
    });

    // If employer, create company with the user's _id as userId
    if (role === 'employer' && companyName) {
      let company = await Company.findOne({ name: companyName });
      if (!company) {
        company = await Company.create({
          name: companyName,
          contactEmail: email,
          userId: user._id,  // ✅ store the user ID
        });
      } else {
        // If company already exists, assign it to this user (optional)
        company.userId = user._id;
        await company.save();
      }
      companyId = company._id;
      user.companyId = companyId;
      await user.save();
    }

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

    // ─── Check user account status ──────────────────────────────
    const userStatus = checkUserStatus(user);
    if (userStatus.blocked) {
      await logAttempt(req, { userId: user._id, emailAttempted: email, success: false, reason: user.accountStatus });
      return res.status(403).json({ error: userStatus.message });
    }

    // ─── Check company moderation status for employers ──────────
    if (user.role === 'employer') {
      const companyStatus = await checkCompanyStatus(user.companyId);
      if (companyStatus === 'banned') {
        await logAttempt(req, { userId: user._id, emailAttempted: email, success: false, reason: 'company_banned' });
        return res.status(403).json({ error: 'Your company has been banned. Please contact admin@skillbridge.ug.' });
      }
      if (companyStatus === 'suspended') {
        await logAttempt(req, { userId: user._id, emailAttempted: email, success: false, reason: 'company_suspended' });
        return res.status(403).json({ error: 'Your company has been suspended. Please contact admin@skillbridge.ug.' });
      }
    }

    // ─── Verify password ──────────────────────────────────────────
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

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;
    
    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google.' });
    }

    let user = await User.findOne({ email });
    
    if (!user) {
      user = await User.create({
        email,
        fullName: name || email.split('@')[0],
        avatar: picture || null,
        oauthProvider: 'google',
        oauthId: googleId,
        isEmailVerified: true,
        role: 'skilled_worker',
        passwordHash: 'oauth-no-password',
        accountStatus: 'active',
      });
      logger.info(`New user created via Google OAuth: ${email}`);
    } else {
      if (!user.oauthProvider) {
        user.oauthProvider = 'google';
        user.oauthId = googleId;
        user.isEmailVerified = true;
        await user.save();
        logger.info(`Existing user linked to Google OAuth: ${email}`);
      }
    }

    // ─── Check user account status ──────────────────────────────
    const userStatus = checkUserStatus(user);
    if (userStatus.blocked) {
      return res.status(403).json({ error: userStatus.message });
    }

    // ─── Check company moderation status for employers ──────────
    if (user.role === 'employer') {
      const companyStatus = await checkCompanyStatus(user.companyId);
      if (companyStatus === 'banned') {
        return res.status(403).json({ error: 'Your company has been banned. Please contact admin@skillbridge.ug.' });
      }
      if (companyStatus === 'suspended') {
        return res.status(403).json({ error: 'Your company has been suspended. Please contact admin@skillbridge.ug.' });
      }
    }

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

    const user = await User.findById(decoded.id).populate('companyId');
    if (!user) return res.status(401).json({ error: 'Invalid refresh token.' });

    // ─── Check user account status ──────────────────────────────
    const userStatus = checkUserStatus(user);
    if (userStatus.blocked) {
      return res.status(403).json({ error: userStatus.message });
    }

    // ─── Check company moderation status for employers ──────────
    if (user.role === 'employer') {
      const companyStatus = await checkCompanyStatus(user.companyId);
      if (companyStatus === 'banned') {
        return res.status(403).json({ error: 'Your company has been banned. Please contact admin.' });
      }
      if (companyStatus === 'suspended') {
        return res.status(403).json({ error: 'Your company has been suspended. Please contact admin.' });
      }
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
  try {
    const user = req.user;

    // ─── Check user account status ──────────────────────────────
    const userStatus = checkUserStatus(user);
    if (userStatus.blocked) {
      return res.status(403).json({ error: userStatus.message });
    }

    // ─── Check company moderation status for employers ──────────
    if (user.role === 'employer') {
      const companyStatus = await checkCompanyStatus(user.companyId);
      if (companyStatus === 'banned') {
        return res.status(403).json({ error: 'Your company has been banned. Please contact admin.' });
      }
      if (companyStatus === 'suspended') {
        return res.status(403).json({ error: 'Your company has been suspended. Please contact admin.' });
      }
    }

    res.json({ user });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch user data.' });
  }
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
 */
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered. Please login.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OtpRequest.findOneAndUpdate(
      { email },
      { otp, expiresAt, channel: 'email' },
      { upsert: true, new: true }
    );

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
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp, userData } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const record = await OtpRequest.findOne({ email, otp });
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    const { fullName, password, role, phoneNumber, companyName } = userData;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Create user first
    const user = await User.create({
      email,
      passwordHash: password,
      fullName,
      role: role || 'skilled_worker',
      phoneNumber: phoneNumber || null,
      isEmailVerified: true,
    });

    let companyId = null;
    if (role === 'employer' && companyName) {
      let company = await Company.findOne({ name: companyName });
      if (!company) {
        company = await Company.create({
          name: companyName,
          contactEmail: email,
          userId: user._id,  // ✅ store the user ID
        });
      } else {
        company.userId = user._id;
        await company.save();
      }
      companyId = company._id;
      user.companyId = companyId;
      await user.save();
    }

    await OtpRequest.deleteOne({ _id: record._id });
    logger.info(`User registered via email OTP: ${email}`);

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