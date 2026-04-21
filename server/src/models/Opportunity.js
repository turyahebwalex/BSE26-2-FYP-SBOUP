const mongoose = require('mongoose');

/**
 * Opportunity (SDD Chapter 4, Table 4.10)
 * A job / gig posting. Linked to a Company (companyId) and the
 * employer User who posted it (postedByUserId). fraudRiskScore is
 * written by the fraud-detection microservice; status transitions
 * follow the 30 / 70 risk thresholds (auto-publish < 30, admin
 * review 30-70, block >= 70).
 */
const opportunitySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    postedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    category: {
      type: String,
      required: true,
      enum: ['formal', 'contract', 'freelance', 'apprenticeship'],
    },
    requiredSkills: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
      },
    ],
    description: { type: String, required: true, maxlength: 5000 },
    location: { type: String, required: true, maxlength: 200 },
    compensationRange: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: 'UGX' },
      period: {
        type: String,
        enum: ['hourly', 'daily', 'weekly', 'monthly', 'project'],
      },
    },
    deadline: { type: Date, required: true },
    fraudRiskScore: { type: Number, min: 0, max: 100, default: 0 },
    fraudSignals: [
      {
        signal: String,
        weight: Number,
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'published', 'under_review', 'blocked', 'archived'],
      default: 'draft',
    },
    isRemote: { type: Boolean, default: false },
    experienceLevel: {
      type: String,
      enum: ['entry', 'mid', 'senior', 'any'],
      default: 'any',
    },
    schedule: { type: String, maxlength: 100 },
    mediaUrls: [{ type: String }],
    applicationMethod: {
      type: String,
      enum: ['internal', 'external'],
      default: 'internal',
    },
    externalLink: { type: String },
    viewCount: { type: Number, default: 0 },
    applicationCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// Virtual back-compat: expose employerId === postedByUserId for legacy code.
opportunitySchema.virtual('employerId').get(function () {
  return this.postedByUserId;
});
opportunitySchema.set('toJSON', { virtuals: true });
opportunitySchema.set('toObject', { virtuals: true });

opportunitySchema.index({ postedByUserId: 1 });
opportunitySchema.index({ companyId: 1 });
opportunitySchema.index({ status: 1, category: 1 });
opportunitySchema.index({ location: 1 });
opportunitySchema.index({ deadline: 1 });
opportunitySchema.index({ fraudRiskScore: 1 });
opportunitySchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Opportunity', opportunitySchema);
