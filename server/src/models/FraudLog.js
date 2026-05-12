const mongoose = require('mongoose');

const fraudLogSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: ['model', 'workflow', 'admin'],
    },
    stage: {
      type: String,
      required: true,
      enum: ['inference', 'create', 'update', 'moderation'],
    },
    fraudScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    classification: {
      type: String,
      enum: ['Low Risk', 'Medium Risk', 'High Risk', 'Unknown'],
      default: 'Unknown',
    },
    decisionOutcome: {
      type: String,
      required: true,
      enum: ['published', 'under_review', 'blocked'],
    },
    decisionReason: {
      type: String,
      maxlength: 1000,
      default: '',
    },
    thresholds: {
      low: { type: Number, min: 0, max: 100 },
      high: { type: Number, min: 0, max: 100 },
    },
    features: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    signals: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    explanation: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adminAction: {
      type: String,
      enum: ['approve', 'reject'],
      default: null,
    },
    adminFeedback: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    minimize: false,
  }
);

fraudLogSchema.index({ opportunityId: 1, createdAt: -1 });
fraudLogSchema.index({ source: 1, createdAt: -1 });
fraudLogSchema.index({ decisionOutcome: 1, createdAt: -1 });

module.exports = mongoose.model('FraudLog', fraudLogSchema);