const router = require('express').Router();
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/opportunity.controller');

// ─── Existing CRUD routes ─────────────────────────────────────────────
router.post('/', authenticate, authorize('employer'), validate('createOpportunity'), ctrl.createOpportunity);
router.get('/', optionalAuth, ctrl.getOpportunities);
router.get('/employer/mine', authenticate, authorize('employer'), ctrl.getMyOpportunities);
router.get('/:id', optionalAuth, ctrl.getOpportunityById);
router.put('/:id', authenticate, authorize('employer'), ctrl.updateOpportunity);
router.delete('/:id', authenticate, authorize('employer'), ctrl.archiveOpportunity);

// ─── Application Methods Routes ─────────────────────────────────────
router.get('/:opportunityId/apply-options', authenticate, ctrl.getApplicationOptions);

// Get external application URL for redirect
router.get('/:opportunityId/external-url', authenticate, ctrl.getExternalApplyUrl);

// Get custom questions for in-app application form
router.get('/:opportunityId/application-form', authenticate, ctrl.getApplicationForm);

// Check if user has already applied
router.get('/:opportunityId/check-application', authenticate, ctrl.checkApplicationStatus);

// Apply via message (POST)
router.post('/apply-by-message', authenticate, ctrl.applyViaMessage);

module.exports = router;