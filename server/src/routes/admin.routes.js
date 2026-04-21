const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

router.get('/dashboard', authenticate, authorize('admin'), ctrl.getDashboardStats);
router.get('/dashboard/trends', authenticate, authorize('admin'), ctrl.getRegistrationTrends);
router.get('/dashboard/user-distribution', authenticate, authorize('admin'), ctrl.getUserTypeDistribution);
router.get('/dashboard/alerts', authenticate, authorize('admin'), ctrl.getUrgentAlerts);
router.get('/dashboard/user-density', authenticate, authorize('admin'), ctrl.getUserDensity);
router.get('/flagged', authenticate, authorize('admin'), ctrl.getFlaggedContent);
router.post('/moderate', authenticate, authorize('admin'), ctrl.moderateContent);
router.get('/users', authenticate, authorize('admin'), ctrl.getUsers);
router.put('/users/:userId', authenticate, authorize('admin'), ctrl.updateUserStatus);

module.exports = router;
