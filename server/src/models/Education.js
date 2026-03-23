const mongoose = require('mongoose');

const educationSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
  },
  institution: { type: String, required: true, maxlength: 200 },
  qualification: { type: String, required: true, maxlength: 150 },
  fieldOfStudy: { type: String, maxlength: 100 },
  startYear: { type: Number, required: true },
  endYear: { type: Number },
});

educationSchema.index({ profileId: 1 });

module.exports = mongoose.model('Education', educationSchema);
