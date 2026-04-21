const logger = require('../utils/logger');

/**
 * Email service abstraction. In production this wraps SendGrid /
 * Amazon SES; in dev (no SENDGRID_API_KEY) it logs the intended
 * message so developers can copy/paste verification links.
 */

let transport = null;

const init = () => {
  if (process.env.SENDGRID_API_KEY) {
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      transport = sgMail;
      logger.info('Email transport: SendGrid');
    } catch (err) {
      logger.warn('SendGrid package missing; falling back to console transport');
    }
  } else {
    logger.info('Email transport: console (dev mode)');
  }
};

const send = async ({ to, subject, html, text }) => {
  const from = process.env.EMAIL_FROM || 'noreply@skillbridge.ug';
  const payload = { to, from, subject, html, text: text || subject };

  if (transport) {
    try {
      await transport.send(payload);
      return { sent: true, provider: 'sendgrid' };
    } catch (err) {
      logger.error('Email send failed:', err.message);
      return { sent: false, error: err.message };
    }
  }

  logger.info(`[email-dev] to=${to} subject="${subject}"`);
  if (process.env.NODE_ENV !== 'test') {
    logger.info(`[email-dev-body] ${text || html}`);
  }
  return { sent: true, provider: 'console' };
};

const sendVerificationEmail = (user, token) => {
  const url = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify?token=${token}`;
  return send({
    to: user.email,
    subject: 'Verify your SkillBridge email',
    html: `<p>Hello ${user.fullName},</p><p>Please verify your email: <a href="${url}">${url}</a></p>`,
    text: `Verify your email: ${url}`,
  });
};

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

module.exports = { send, sendVerificationEmail, sendPasswordResetEmail };
