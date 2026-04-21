const mongoose = require('mongoose');

/**
 * Company (SDD Chapter 4, Table 4.3)
 * Represents an employer organisation. A Company may be linked
 * to one or more User accounts (employer role).
 */
const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      unique: true,
      trim: true,
      maxlength: 200,
    },
    registrationNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      sparse: true,
    },
    industry: {
      type: String,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    website: { type: String, maxlength: 500 },
    logoUrl: { type: String, maxlength: 500 },
    location: { type: String, maxlength: 200 },
    contactEmail: { type: String, lowercase: true, maxlength: 255 },
    contactPhone: { type: String, maxlength: 20 },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    trustScore: { type: Number, min: 0, max: 100, default: 50 },
  },
  { timestamps: true }
);

companySchema.index({ name: 1 }, { unique: true });
companySchema.index({ verificationStatus: 1 });
companySchema.index({ industry: 1 });

module.exports = mongoose.model('Company', companySchema);
