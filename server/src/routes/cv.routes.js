const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/cv.controller');

router.post('/generate', authenticate, validate('generateCV'), ctrl.generateCV);
router.get('/mine', authenticate, ctrl.getMyCVs);
router.get('/:id', authenticate, ctrl.getCVById);
router.delete('/:id', authenticate, ctrl.deleteCV);

module.exports = router;
