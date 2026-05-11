const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/learning.controller');

router.post('/generate', authenticate, validate('generateLearningPath'), ctrl.generateLearningPath);
router.post('/skill-gaps', authenticate, validate('analyseSkillGaps'), ctrl.analyseSkillGaps);
router.post('/dashboard-fit', authenticate, ctrl.getDashboardFit);
router.get('/mine', authenticate, ctrl.getMyLearningPaths);
router.put('/:id/progress', authenticate, ctrl.updateProgress);

module.exports = router;
