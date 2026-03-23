const mongoose = require('mongoose');

const cvSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
  },
  templateType: {
    type: String,
    required: true,
    enum: ['chronological', 'skills_based', 'portfolio_focused'],
  },
  fileUrl: { type: String, required: true, maxlength: 500 },
  generatedAt: { type: Date, default: Date.now },
});

cvSchema.index({ profileId: 1 });

module.exports = mongoose.model('CV', cvSchema);
