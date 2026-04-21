const router = require('express').Router();
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/company.controller');

router.get('/', optionalAuth, ctrl.getCompanies);
router.get('/:id', optionalAuth, ctrl.getCompanyById);
router.post('/', authenticate, authorize('employer', 'admin'), validate('createCompany'), ctrl.createCompany);
router.put('/:id', authenticate, ctrl.updateCompany);
router.put('/:id/verification', authenticate, authorize('admin'), ctrl.setVerificationStatus);

module.exports = router;
