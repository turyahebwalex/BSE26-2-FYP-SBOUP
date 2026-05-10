const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/user.controller');

// ========== PROFILE MANAGEMENT ==========
router.get('/me', authenticate, ctrl.getMe);
router.put('/me', authenticate, ctrl.updateMe);
router.put('/change-password', authenticate, ctrl.changePassword);
router.delete('/deactivate', authenticate, ctrl.deactivateAccount);

// ========== AVATAR MANAGEMENT ==========
router.post('/avatar', authenticate, ctrl.uploadAvatar, ctrl.updateAvatar);
router.delete('/avatar', authenticate, ctrl.removeAvatar);

// ========== MESSAGING PREFERENCES ==========
router.get('/messaging-preferences', authenticate, ctrl.getMessagingPreferences);
router.put('/messaging-preferences', authenticate, ctrl.updateMessagingPreferences);

// ========== ONLINE STATUS ==========
router.post('/online-status', authenticate, ctrl.updateOnlineStatus);
router.get('/status/:userId', authenticate, ctrl.getUserStatus);
router.post('/status/batch', authenticate, ctrl.getMultipleUsersStatus);

// ========== BLOCK MANAGEMENT ==========
router.post('/block/:userId', authenticate, ctrl.toggleBlockUser);
router.delete('/block/:userId', authenticate, ctrl.unblockUser);
router.get('/blocked', authenticate, ctrl.getBlockedUsers);

// ========== MESSAGING FEATURES ==========
router.get('/search', authenticate, ctrl.searchUsers);
router.get('/conversations', authenticate, ctrl.getUserConversations);
router.get('/typing/:userId', authenticate, ctrl.getTypingStatus);

// ========== SUGGESTIONS ==========
router.get('/suggested', authenticate, ctrl.getSuggestedUsers);

// ========== SEARCH ==========
router.get('/locations/search', authenticate, ctrl.searchLocations);
router.get('/companies/search', authenticate, ctrl.searchCompanies);
router.get('/location/:location', authenticate, ctrl.getUsersByLocation);

module.exports = router;