const mongoose = require('mongoose');

/**
 * Opportunity (SDD Chapter 4, Table 4.10)
 * A job / gig posting. Linked to a Company (companyId) and the
 * employer User who posted it (postedByUserId). fraudRiskScore is
 * written by the fraud-detection microservice; status transitions
 * follow the 30 / 70 risk thresholds (auto-publish < 30, admin
 * review 30-70, block >= 70).
 * 
 * Updated to support multiple application methods:
 * - in_app: Submit CV, cover letter, and documents directly in the app
 * - message: Send a direct message to the employer
 * - external_link: Redirect to external form (Google Forms, Typeform, etc.)
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
    
    // ─── UPDATED: Application Methods (supports multiple options) ───
    // Allowed application methods for this opportunity
    applicationMethods: {
      type: [String],
      enum: ['in_app', 'message', 'external_link'],
      default: ['in_app'],
    },
    
    // External application link (for Google Forms, Typeform, company website, etc.)
    externalApplyUrl: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          // Allow http(s) links, mailto:, tel: and whatsapp links
          return /^(https?:\/\/|mailto:|tel:|whatsapp:)/.test(v);
        },
        message: 'External URL must start with http://, https://, mailto:, tel:, or whatsapp:'
      }
    },
    
    // Instructions for message-based applications
    messageInstructions: {
      type: String,
      maxlength: 1000,
      default: 'Send a message introducing yourself, your skills, and why you are interested in this position.'
    },
    
    // Required documents for in-app applications
    requiredDocuments: [{
      type: String,
      enum: ['cv', 'cover_letter', 'portfolio', 'certificates', 'references']
    }],
    
    // Custom questions for in-app application form
    customQuestions: [{
      question: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['text', 'textarea', 'file', 'select'],
        default: 'textarea'
      },
      required: { type: Boolean, default: false },
      options: [String], // For select type
      maxLength: { type: Number, default: 500 },
    }],
    
    // Track external link clicks for analytics
    externalClickCount: { type: Number, default: 0 },
    
    // Legacy fields (keep for backward compatibility)
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

// Virtual to check if external link is available
opportunitySchema.virtual('hasExternalLink').get(function () {
  return this.applicationMethods.includes('external_link') && this.externalApplyUrl;
});

// Virtual to check if message application is available
opportunitySchema.virtual('hasMessageApplication').get(function () {
  return this.applicationMethods.includes('message');
});

// Virtual to check if in-app application is available
opportunitySchema.virtual('hasInAppApplication').get(function () {
  return this.applicationMethods.includes('in_app');
});

// Virtual to get available application methods with details
opportunitySchema.virtual('availableApplicationMethods').get(function () {
  const methods = [];
  
  if (this.applicationMethods.includes('in_app')) {
    methods.push({
      type: 'in_app',
      label: 'In-App Application',
      description: 'Submit your CV, cover letter, and supporting documents directly',
      icon: 'document-text-outline',
      color: '#F59E0B'
    });
  }
  
  if (this.applicationMethods.includes('message')) {
    methods.push({
      type: 'message',
      label: 'Apply via Message',
      description: this.messageInstructions || 'Send a direct message to the employer',
      icon: 'chatbubble-outline',
      color: '#3B82F6'
    });
  }
  
  if (this.applicationMethods.includes('external_link') && this.externalApplyUrl) {
    methods.push({
      type: 'external_link',
      label: 'External Application',
      description: 'Apply through an external form',
      icon: 'link-outline',
      color: '#10B981',
      url: this.externalApplyUrl
    });
  }
  
  return methods;
});

opportunitySchema.set('toJSON', { virtuals: true });
opportunitySchema.set('toObject', { virtuals: true });

// Indexes
opportunitySchema.index({ postedByUserId: 1 });
opportunitySchema.index({ companyId: 1 });
opportunitySchema.index({ status: 1, category: 1 });
opportunitySchema.index({ location: 1 });
opportunitySchema.index({ deadline: 1 });
opportunitySchema.index({ fraudRiskScore: 1 });
opportunitySchema.index({ title: 'text', description: 'text' });
opportunitySchema.index({ applicationMethods: 1 }); // For filtering by application type

module.exports = mongoose.model('Opportunity', opportunitySchema);