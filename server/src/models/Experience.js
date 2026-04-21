const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
  },
  jobTitle: { type: String, required: true, maxlength: 100 },
  companyName: { type: String, maxlength: 150 },
  category: { type: String, required: true, maxlength: 50 },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  durationMonths: { type: Number },
  numberOfYears: { type: Number },
  description: { type: String, maxlength: 2000 },
});

experienceSchema.pre('save', function (next) {
  if (this.startDate) {
    const end = this.endDate || new Date();
    const months = (end.getFullYear() - this.startDate.getFullYear()) * 12
      + (end.getMonth() - this.startDate.getMonth());
    this.durationMonths = Math.max(0, months);
    this.numberOfYears = Math.round((this.durationMonths / 12) * 10) / 10;
  }
  next();
});

experienceSchema.index({ profileId: 1 });
experienceSchema.index({ category: 1 });

module.exports = mongoose.model('Experience', experienceSchema);
