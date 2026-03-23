const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/skill.controller');

router.get('/', ctrl.getSkills);
router.get('/categories', authenticate, ctrl.getSkillCategories);
router.post('/', authenticate, authorize('admin'), ctrl.createSkill);
router.put('/:id', authenticate, authorize('admin'), ctrl.updateSkill);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteSkill);

module.exports = router;
