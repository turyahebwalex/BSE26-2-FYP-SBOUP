const router = require('express').Router();
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/opportunity.controller');

router.post('/', authenticate, authorize('employer'), ctrl.createOpportunity);
router.get('/', optionalAuth, ctrl.getOpportunities);
router.get('/employer/mine', authenticate, authorize('employer'), ctrl.getMyOpportunities);
router.get('/:id', optionalAuth, ctrl.getOpportunityById);
router.put('/:id', authenticate, authorize('employer'), ctrl.updateOpportunity);
router.delete('/:id', authenticate, authorize('employer'), ctrl.archiveOpportunity);

module.exports = router;
