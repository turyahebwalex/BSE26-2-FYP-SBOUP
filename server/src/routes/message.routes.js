const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/message.controller');

router.post('/', authenticate, ctrl.sendMessage);
router.get('/inbox', authenticate, ctrl.getInbox);
router.get('/unread-count', authenticate, ctrl.getUnreadCount);
router.get('/conversation/:userId', authenticate, ctrl.getConversation);

module.exports = router;
