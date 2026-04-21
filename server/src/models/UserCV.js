const mongoose = require('mongoose');

/**
 * UserCV (SDD Chapter 4, Table 4.12)
 * A generated CV belonging to a worker. Optionally targeted at a
 * specific opportunity (opportunityId) with a cvFieldTarget snapshot
 * of the profile data actually rendered (skills subset, experience
 * ordering, etc.) so regeneration is deterministic.
 */
const userCVSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
  },
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    default: null,
  },
  templateType: {
    type: String,
    required: true,
    enum: ['chronological', 'skills_based', 'portfolio_focused'],
    default: 'chronological',
  },
  cvFieldTarget: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  description: { type: String, maxlength: 500 },
  fileUrl: { type: String, required: true, maxlength: 500 },
  fileFormat: { type: String, enum: ['pdf', 'docx', 'html'], default: 'pdf' },
  generatedAt: { type: Date, default: Date.now },
});

userCVSchema.index({ userId: 1, generatedAt: -1 });
userCVSchema.index({ opportunityId: 1 });

module.exports = mongoose.model('UserCV', userCVSchema);
