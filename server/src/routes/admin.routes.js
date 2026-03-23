const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

router.get('/dashboard', authenticate, authorize('admin'), ctrl.getDashboardStats);
router.get('/flagged', authenticate, authorize('admin'), ctrl.getFlaggedContent);
router.post('/moderate', authenticate, authorize('admin'), ctrl.moderateContent);
router.get('/users', authenticate, authorize('admin'), ctrl.getUsers);
router.put('/users/:userId', authenticate, authorize('admin'), ctrl.updateUserStatus);

module.exports = router;
