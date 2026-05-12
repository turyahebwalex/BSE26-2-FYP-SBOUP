const mongoose = require('mongoose');

const aliasHintSchema = new mongoose.Schema(
  {
    missingSkill: String,
    youMayAlreadyHave: String,
    similarity: Number,
    suggestion: String,
  },
  { _id: false }
);

const matchBreakdownSchema = new mongoose.Schema(
  {
    matchScore: Number,
    cosineScore: Number,
    locationMatch: Boolean,
    salaryFit: Boolean,
    expFit: Boolean,
    skillOverlap: Number,
    skillGap: Number,
    modelUsed: String,
    shortlistProbability: Number,
  },
  { _id: false, strict: false }
);

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    provider: { type: String },
    cost: { type: Number, default: 0 },
    priceLabel: { type: String },
    estimatedDuration: { type: String },
    // 'book' covers free e-book references in the curated catalog
    // (e.g. Scrum Guide, Don't Make Me Think) — valuable upskilling
    // resources that don't fit course/video/article/tutorial.
    type: { type: String, enum: ['video', 'course', 'article', 'tutorial', 'book'] },
    rating: { type: Number },
    difficultyLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
    relevanceScore: { type: Number },
    finalScore: { type: Number },
    bridgesSkill: { type: String },
    whyThisCourse: { type: String },
    isCompleted: { type: Boolean, default: false },
  },
  { _id: false }
);

const learningPathSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    default: null,
  },
  targetSkill: { type: String, required: true },
  // Authoritative source of the missing-skills list: matching-engine for
  // opportunity-driven, local analyser for target-skill mode.
  consistencyMode: {
    type: String,
    enum: ['matching-engine', 'standalone', 'fallback'],
    default: 'standalone',
  },
  missingSkills: { type: [String], default: [] },
  criticalGapCount: { type: Number, default: 0 },
  analysisSummary: { type: String, default: '' },
  pathwayRationale: { type: String, default: '' },
  matchBreakdown: { type: matchBreakdownSchema, default: null },
  aliasHints: { type: [aliasHintSchema], default: [] },
  resources: { type: [resourceSchema], default: [] },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived'],
    default: 'active',
  },
  skillGapLogId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

learningPathSchema.index({ userId: 1, status: 1 });
learningPathSchema.index({ userId: 1, opportunityId: 1 });

module.exports = mongoose.model('LearningPath', learningPathSchema);
