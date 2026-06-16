const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/message.controller');
const { uploadMessageAttachments } = require('../middleware/upload');


router.post('/', 
  authenticate, 
  uploadMessageAttachments,
  (req, res, next) => {
    console.log('=== MESSAGE DEBUG ===');
    console.log('body:', JSON.stringify(req.body));
    console.log('files:', req.files);
    console.log('====================');
    next();
  },
  ctrl.sendMessage
);

// Get inbox conversations
router.get('/inbox', authenticate, ctrl.getInbox);

// Get unread message count
router.get('/unread-count', authenticate, ctrl.getUnreadCount);

// Get conversation with specific user (with pagination)
router.get('/conversation/:userId', authenticate, ctrl.getConversation);

// ========== MESSAGE STATUS ROUTES ==========
// Mark messages as delivered
router.post('/mark-delivered', authenticate, ctrl.markAsDelivered);

// Mark messages as read
router.post('/mark-read', authenticate, ctrl.markAsRead);

// ========== TYPING INDICATOR ==========
router.post('/typing', authenticate, ctrl.typingIndicator);

// ========== DELETE ROUTES ==========
// Delete single message
router.delete('/:messageId', authenticate, ctrl.deleteMessage);

// Delete entire conversation
router.delete('/conversation/:userId', authenticate, ctrl.deleteConversation);

module.exports = router;