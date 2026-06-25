const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

router.get('/dashboard', authenticate, authorize('admin'), ctrl.getDashboardStats);
router.get('/dashboard/trends', authenticate, authorize('admin'), ctrl.getRegistrationTrends);
router.get('/dashboard/user-distribution', authenticate, authorize('admin'), ctrl.getUserTypeDistribution);
router.get('/dashboard/alerts', authenticate, authorize('admin'), ctrl.getUrgentAlerts);
router.get('/dashboard/user-density', authenticate, authorize('admin'), ctrl.getUserDensity);
router.get('/fraud-insights', authenticate, authorize('admin'), ctrl.getFraudInsights);
router.get('/flagged', authenticate, authorize('admin'), ctrl.getFlaggedContent);
router.post('/moderate', authenticate, authorize('admin'), ctrl.moderateContent);
router.get('/users', authenticate, authorize('admin'), ctrl.getUsers);
router.get('/users/:userId', authenticate, authorize('admin'), ctrl.getUserById);
router.put('/users/:userId', authenticate, authorize('admin'), ctrl.updateUserStatus);
router.get('/appeals', authenticate, authorize('admin'), ctrl.getAppealsQueue);
router.post('/appeals/:id/review', authenticate, authorize('admin'), ctrl.reviewAppeal);
router.get('/archived-opportunities', authenticate, authorize('admin'), ctrl.getArchivedOpportunities);
router.post('/archived-opportunities/:id/restore', authenticate, authorize('admin'), ctrl.restoreArchivedOpportunity);
router.delete('/opportunities/:id/permanent-remove', authenticate, authorize('admin'), ctrl.permanentlyRemoveOpportunity);

// Model health, drift detection & training export
router.get('/model-health', authenticate, authorize('admin'), ctrl.getModelHealth);
router.get('/training-export', authenticate, authorize('admin'), ctrl.getTrainingExport);

// Report-driven moderation actions (user / company / message)
router.post('/users/:userId/action', authenticate, authorize('admin'), ctrl.applyUserAction);
router.post('/companies/:companyId/action', authenticate, authorize('admin'), ctrl.applyCompanyAction);
router.post('/messages/:messageId/action', authenticate, authorize('admin'), ctrl.applyMessageAction);

module.exports = router;