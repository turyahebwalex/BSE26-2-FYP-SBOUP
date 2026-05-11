const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/notification.controller');

// Only use the methods that actually exist in your controller
router.get('/', authenticate, ctrl.getNotifications);
router.put('/:notificationId/read', authenticate, ctrl.markAsRead);
router.put('/read-all', authenticate, ctrl.markAllAsRead);
router.delete('/:notificationId', authenticate, ctrl.deleteNotification);

module.exports = router;