const router = require('express').Router();
const passport = require('passport');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/auth.controller');

router.post('/register', authLimiter, validate('register'), ctrl.register);
router.post('/login', authLimiter, validate('login'), ctrl.login);
router.post('/refresh', ctrl.refreshToken);
router.post('/forgot-password', authLimiter, validate('forgotPassword'), ctrl.forgotPassword);
router.post('/reset-password/:token', validate('resetPassword'), ctrl.resetPassword);
router.get('/verify-email/:token', ctrl.verifyEmail);
router.get('/me', authenticate, ctrl.getMe);

// Google OAuth - Passport (Web + mobile browser redirect flow)
// `?platform=mobile` is carried through Google as the OAuth `state` so the
// callback knows to redirect back to the app's deep link instead of the web
// client. Lets mobile reuse the exact same server-side Google flow as web —
// no per-device or per-user OAuth config needed.
router.get('/google', (req, res, next) => {
  // Carry the platform flag and (for mobile) the app's own redirect URI through
  // Google as the OAuth `state`, base64-encoded JSON. The app passes a redirect
  // that the *running* environment can catch (exp:// in Expo Go, skillbridge://
  // in a dev build), so the callback can send the browser back to the right place.
  const isMobile = req.query.platform === 'mobile';
  const statePayload = {
    platform: isMobile ? 'mobile' : 'web',
    redirect: isMobile && req.query.redirect ? String(req.query.redirect) : undefined,
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});
router.get('/google/callback', passport.authenticate('google', { session: false }), ctrl.googleCallback);

// Google Login - Token-based (For mobile apps)
router.post('/google', ctrl.googleLogin); 

// OTP routes – email
router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);

module.exports = router;