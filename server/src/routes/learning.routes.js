const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/learning.controller');

router.post('/generate', authenticate, ctrl.generateLearningPath);
router.get('/mine', authenticate, ctrl.getMyLearningPaths);
router.put('/:id/progress', authenticate, ctrl.updateProgress);

module.exports = router;
