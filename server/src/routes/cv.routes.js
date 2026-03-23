const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/cv.controller');

router.post('/generate', authenticate, ctrl.generateCV);
router.get('/mine', authenticate, ctrl.getMyCVs);
router.delete('/:id', authenticate, ctrl.deleteCV);

module.exports = router;
