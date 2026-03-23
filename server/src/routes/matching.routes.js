const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/matching.controller');

router.get('/recommendations', authenticate, ctrl.getRecommendations);
router.get('/score', authenticate, ctrl.getMatchScore);

module.exports = router;
