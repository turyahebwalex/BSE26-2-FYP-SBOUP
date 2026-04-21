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

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false }), ctrl.googleCallback);

module.exports = router;
