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
  },
});

skillSchema.index({ skillName: 1 });
skillSchema.index({ category: 1 });

module.exports = mongoose.model('Skill', skillSchema);
