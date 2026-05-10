const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/application.controller');

router.post('/', authenticate, authorize('skilled_worker'), validate('applyForOpportunity'), ctrl.applyForOpportunity);
router.get('/mine', authenticate, authorize('skilled_worker'), ctrl.getMyApplications);
router.get('/opportunity/:opportunityId', authenticate, authorize('employer'), ctrl.getApplicationsForOpportunity);
router.put('/:id/status', authenticate, authorize('employer'), ctrl.updateApplicationStatus);
router.put('/:id/withdraw', authenticate, authorize('skilled_worker'), ctrl.withdrawApplication);
// 🆕 Pin / unpin an application (only the worker who owns it can toggle)
router.put('/:id/pin', authenticate, authorize('skilled_worker'), ctrl.togglePinApplication);

module.exports = router;