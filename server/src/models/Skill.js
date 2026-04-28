const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  skillName: {
    type: String,
    required: true,
    unique: true,
    maxlength: 100,
  },
  category: {
    type: String,
    required: true,
    maxlength: 50,
    enum: ['Technical', 'Creative', 'Trade', 'Business', 'Communication', 'Other'],
    default: 'Other',
  },
  isCustom:   { type: Boolean, default: false },
  isExternal: { type: Boolean, default: false },
  source:     { type: String,  default: null },
});

skillSchema.index({ skillName: 1 });
skillSchema.index({ category: 1 });

module.exports = mongoose.model('Skill', skillSchema);
