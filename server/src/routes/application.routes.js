const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/application.controller');

router.post('/', authenticate, authorize('skilled_worker'), ctrl.applyForOpportunity);
router.get('/mine', authenticate, authorize('skilled_worker'), ctrl.getMyApplications);
router.get('/opportunity/:opportunityId', authenticate, authorize('employer'), ctrl.getApplicationsForOpportunity);
router.put('/:id/status', authenticate, authorize('employer'), ctrl.updateApplicationStatus);

module.exports = router;
