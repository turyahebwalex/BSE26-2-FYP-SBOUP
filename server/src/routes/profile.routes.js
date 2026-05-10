const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/profile.controller');

router.post('/', authenticate, validate('createProfile'), ctrl.createProfile);
router.get('/me', authenticate, ctrl.getMyProfile);
router.put('/me', authenticate, ctrl.updateProfile);
router.get('/:id', ctrl.getProfileById);

// Skills
router.post('/skills', authenticate, validate('addProfileSkill'), ctrl.addSkill);
router.delete('/skills/:skillId', authenticate, ctrl.removeSkill);

// Experience
router.post('/experience', authenticate, validate('addExperience'), ctrl.addExperience);
router.put('/experience/:expId', authenticate, ctrl.updateExperience);
router.delete('/experience/:expId', authenticate, ctrl.deleteExperience);

// Education
router.post('/education', authenticate, validate('addEducation'), ctrl.addEducation);
router.delete('/education/:eduId', authenticate, ctrl.deleteEducation);

// Preferences
router.put('/preferences', authenticate, ctrl.updatePreference);

// Portfolio
router.post('/portfolio', authenticate, ctrl.addPortfolioItem);
router.delete('/portfolio/:itemId', authenticate, ctrl.removePortfolioItem);

module.exports = router;
