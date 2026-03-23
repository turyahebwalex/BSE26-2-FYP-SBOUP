const router = require('express').Router();
const passport = require('passport');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/register', authLimiter, ctrl.register);
router.post('/login', authLimiter, ctrl.login);
router.post('/refresh', ctrl.refreshToken);
router.post('/forgot-password', authLimiter, ctrl.forgotPassword);
router.post('/reset-password/:token', ctrl.resetPassword);
router.get('/verify-email/:token', ctrl.verifyEmail);
router.get('/me', authenticate, ctrl.getMe);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false }), ctrl.googleCallback);

module.exports = router;
