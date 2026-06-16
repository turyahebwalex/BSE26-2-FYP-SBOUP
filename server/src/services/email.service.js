const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;
let transportType = null;

const init = () => {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
      transportType = 'gmail';
      logger.info('Email transport: Gmail SMTP');
      return;
    } catch (err) {
      logger.warn('Failed to initialize Gmail transport:', err.message);
    }
  }

  if (process.env.SENDGRID_API_KEY) {
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      transporter = sgMail;
      transportType = 'sendgrid';
      logger.info('Email transport: SendGrid');
      return;
    } catch (err) {
      logger.warn('SendGrid package missing; falling back to console transport');
    }
  }

  logger.info('Email transport: console (dev mode)');
  transportType = 'console';
};

const send = async ({ to, subject, html, text }) => {
  const from = process.env.EMAIL_FROM || 'noreply@skillbridge.ug';

  if (transportType === 'gmail') {
    try {
      const info = await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to, subject, html,
        text: text || subject,
      });
      return { sent: true, provider: 'gmail', messageId: info.messageId };
    } catch (err) {
      logger.error(`Gmail send failed: ${err.message}`, { stack: err.stack });
      return { sent: false, error: err.message };
    }
  }

  if (transportType === 'sendgrid') {
    try {
      await transporter.send({ to, from, subject, html, text: text || subject });
      return { sent: true, provider: 'sendgrid' };
    } catch (err) {
      logger.error('SendGrid send failed:', err.message);
      return { sent: false, error: err.message };
    }
  }

  logger.info(`[email-dev] to=${to} subject="${subject}"`);
  if (process.env.NODE_ENV !== 'test') logger.info(`[email-dev-body] ${text || html}`);
  return { sent: true, provider: 'console' };
};

// ── SMS via Africa's Talking ──────────────────────────────────────────────────
let atSMS = null;

const initSms = () => {
  if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
    logger.warn('SMS transport: Africa\'s Talking not configured (AT_API_KEY / AT_USERNAME missing)');
    return;
  }
  try {
    const AfricasTalking = require('africastalking');
    const at = AfricasTalking({
      apiKey:   process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,   // 'sandbox' for testing
    });
    atSMS = at.SMS;
    logger.info(`SMS transport: Africa's Talking (${process.env.AT_USERNAME})`);
  } catch (err) {
    logger.warn('Failed to initialize Africa\'s Talking SMS:', err.message);
  }
};

/**
 * Send an SMS message.
 * @param {string} to   - Phone number in international format e.g. +256701234567
 * @param {string} message
 */
const sendSms = async (to, message) => {
  if (!atSMS) {
    // Fallback: log to console in dev
    logger.info(`[sms-dev] to=${to} message="${message}"`);
    return { sent: true, provider: 'console' };
  }
  try {
    const result = await atSMS.send({
      to:      [to],
      message,
      from:    process.env.AT_SENDER_ID || undefined, // optional short-code/sender ID
    });
    logger.info(`SMS sent to ${to}`, result);
    return { sent: true, provider: 'africastalking', result };
  } catch (err) {
    logger.error(`SMS send failed: ${err.message}`, { stack: err.stack });
    return { sent: false, error: err.message };
  }
};

const sendOtpSms = (phone, otp) =>
  sendSms(phone, `Your SkillBridge verification code is: ${otp}. It expires in 10 minutes. Do not share it.`);

// ── Email templates ───────────────────────────────────────────────────────────
const sendVerificationEmail = (user, token) => {
  const url = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify?token=${token}`;
  return send({
    to: user.email,
    subject: 'Verify your SkillBridge email',
    html: `<p>Hello ${user.fullName},</p><p>Please verify your email: <a href="${url}">${url}</a></p>`,
    text: `Verify your email: ${url}`,
  });
};

const sendOtpEmail = (email, otp) =>
  send({
    to: email,
    subject: 'Your SkillBridge verification code',
    html: `<p>Your OTP is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
    text: `Your OTP is: ${otp} (expires in 10 minutes)`,
  });

const sendPasswordResetEmail = (user, token) => {
  const url = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${token}`;
  return send({
    to: user.email,
    subject: 'Reset your SkillBridge password',
    html: `<p>Hello ${user.fullName},</p><p>Reset your password within 30 minutes: <a href="${url}">${url}</a></p>`,
    text: `Reset your password (expires in 30 min): ${url}`,
  });
};

init();
initSms();   // ← initialise SMS transport alongside email

module.exports = {
  send,
  sendSms,
  sendOtpSms,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOtpEmail,
};