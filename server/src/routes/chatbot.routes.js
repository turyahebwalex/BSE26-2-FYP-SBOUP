const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/chatbot.controller');

router.post('/query', authenticate, ctrl.sendQuery);

module.exports = router;
