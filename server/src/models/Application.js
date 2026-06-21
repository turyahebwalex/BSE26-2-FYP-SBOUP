const mongoose = require('mongoose');

/**
 * Application (SDD Chapter 4, Table 4.11)
 */
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
  cvId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserCV',
    default: null,
  },
  coverLetter: { type: String, maxlength: 3000 },
  status: {
    type: String,
    enum: [
      'submitted',
      'under_review',
      'shortlisted',
      'interview_scheduled',
      'rejected',
      'offer_extended',
      'withdrawn',
    ],
    default: 'submitted',
  },
  matchScore: { type: Number, min: 0, max: 100, default: 0 },
  matchBreakdown: {
    skillScore: { type: Number, default: 0 },
    experienceScore: { type: Number, default: 0 },
    collaborativeScore: { type: Number, default: 0 },
  },

  // ─── NEW FIELDS FOR FILE UPLOADS (used by applyForOpportunity) ───
  manualCv: {
    url: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  coverLetterFile: {
    url: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  additionalDocuments: [
    {
      url: { type: String },
      fileName: { type: String },
      fileSize: { type: Number },
      mimeType: { type: String },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  // ─── END NEW FIELDS ──────────────────────────────────────────────

  // Legacy attachments – keep as is
  attachments: [
    {
      fileName: String,
      fileUrl: String,
      fileType: String,
    },
  ],

  // Pin support – appears in "Pinned Applications" section on Messages tab
  isPinned: { type: Boolean, default: false },
  pinnedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: Date.now },
});

applicationSchema.index({ profileId: 1, opportunityId: 1 }, { unique: true });
applicationSchema.index({ opportunityId: 1, status: 1 });
applicationSchema.index({ opportunityId: 1, matchScore: -1 });
applicationSchema.index({ profileId: 1, submittedAt: -1 });
applicationSchema.index({ profileId: 1, isPinned: -1, pinnedAt: -1 });

module.exports = mongoose.model('Application', applicationSchema);