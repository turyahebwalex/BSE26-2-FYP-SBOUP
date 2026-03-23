const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
  },
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    required: true,
  },
  coverLetter: { type: String, maxlength: 3000 },
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'interview_scheduled', 'rejected', 'offer_extended'],
    default: 'submitted',
  },
  matchScore: { type: Number, min: 0, max: 100 },
  attachments: [
    {
      fileName: String,
      fileUrl: String,
      fileType: String,
    },
  ],
  submittedAt: { type: Date, default: Date.now },
});

applicationSchema.index({ profileId: 1, opportunityId: 1 }, { unique: true });
applicationSchema.index({ opportunityId: 1, status: 1 });

module.exports = mongoose.model('Application', applicationSchema);
