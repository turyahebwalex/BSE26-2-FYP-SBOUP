const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/notification.controller');

// /unread-count is registered BEFORE '/:notificationId/...' so Express
// doesn't try to interpret 'unread-count' as a notificationId. Also
// matches the path the rateLimiter's POLLING_EXEMPT set skips.
router.get('/unread-count', authenticate, ctrl.getUnreadCount);
router.get('/', authenticate, ctrl.getNotifications);
router.put('/:notificationId/read', authenticate, ctrl.markAsRead);
router.put('/read-all', authenticate, ctrl.markAllAsRead);
router.delete('/:notificationId', authenticate, ctrl.deleteNotification);

module.exports = router;