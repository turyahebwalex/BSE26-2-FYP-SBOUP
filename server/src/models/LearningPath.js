const mongoose = require('mongoose');

const learningPathSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  targetSkill: { type: String, required: true },
  resources: [
    {
      title: { type: String, required: true },
      url: { type: String, required: true },
      provider: { type: String },
      cost: { type: Number, default: 0 },
      estimatedDuration: { type: String },
      type: { type: String, enum: ['video', 'course', 'article', 'tutorial'] },
      isCompleted: { type: Boolean, default: false },
    },
  ],
  progress: { type: Number, default: 0, min: 0, max: 100 },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived'],
    default: 'active',
  },
  createdAt: { type: Date, default: Date.now },
});

learningPathSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('LearningPath', learningPathSchema);
