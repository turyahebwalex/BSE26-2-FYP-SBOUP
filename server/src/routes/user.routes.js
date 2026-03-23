const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/user.controller');

router.put('/me', authenticate, ctrl.updateMe);
router.put('/change-password', authenticate, ctrl.changePassword);
router.delete('/deactivate', authenticate, ctrl.deactivateAccount);

module.exports = router;
