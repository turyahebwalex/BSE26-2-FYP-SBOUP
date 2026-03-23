const mongoose = require('mongoose');

const profileSkillSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
  },
  skillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Skill',
    required: true,
  },
  proficiencyLevel: {
    type: String,
    required: true,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
  },
  classification: {
    type: String,
    enum: ['primary', 'secondary'],
    default: 'primary',
  },
});

profileSkillSchema.index({ profileId: 1, skillId: 1 }, { unique: true });

module.exports = mongoose.model('ProfileSkill', profileSkillSchema);
