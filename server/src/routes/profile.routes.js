const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/profile.controller');

router.post('/', authenticate, ctrl.createProfile);
router.get('/me', authenticate, ctrl.getMyProfile);
router.put('/me', authenticate, ctrl.updateProfile);
router.get('/:id', ctrl.getProfileById);

// Skills
router.post('/skills', authenticate, ctrl.addSkill);
router.delete('/skills/:skillId', authenticate, ctrl.removeSkill);

// Experience
router.post('/experience', authenticate, ctrl.addExperience);
router.put('/experience/:expId', authenticate, ctrl.updateExperience);
router.delete('/experience/:expId', authenticate, ctrl.deleteExperience);

// Education
router.post('/education', authenticate, ctrl.addEducation);
router.delete('/education/:eduId', authenticate, ctrl.deleteEducation);

// Preferences
router.put('/preferences', authenticate, ctrl.updatePreference);

module.exports = router;
