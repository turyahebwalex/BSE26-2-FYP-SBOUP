const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/report.controller');

router.post('/', authenticate, validate('createReport'), ctrl.createReport);
router.get('/', authenticate, authorize('admin'), ctrl.getReports);
router.get('/target/:targetType/:targetId', authenticate, authorize('admin'), ctrl.getReportsByTarget);
router.put('/:id/status', authenticate, authorize('admin'), ctrl.updateReportStatus);

module.exports = router;
