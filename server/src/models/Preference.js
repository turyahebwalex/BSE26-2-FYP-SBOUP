const mongoose = require('mongoose');

const preferenceSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
    unique: true,
  },
  personalityTraits: [
    {
      trait: { type: String },
      level: { type: String, enum: ['low', 'medium', 'high'] },
    },
  ],
  workStyle: {
    type: String,
    enum: ['collaborative', 'independent', 'flexible'],
  },
  remotePreference: {
    type: String,
    enum: ['high', 'medium', 'low'],
  },
  learningWillingness: {
    type: String,
    enum: ['high', 'medium', 'low'],
  },
  updatedAt: { type: Date, default: Date.now },
});

preferenceSchema.index({ profileId: 1 });

module.exports = mongoose.model('Preference', preferenceSchema);
