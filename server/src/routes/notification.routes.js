const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/notification.controller');

router.get('/', authenticate, ctrl.getNotifications);
router.get('/unread-count', authenticate, ctrl.getUnreadCount);
router.put('/:id/read', authenticate, ctrl.markAsRead);
router.put('/read-all', authenticate, ctrl.markAllAsRead);
router.delete('/:id', authenticate, ctrl.deleteNotification);

module.exports = router;
