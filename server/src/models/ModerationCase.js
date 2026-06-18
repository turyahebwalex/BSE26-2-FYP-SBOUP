const mongoose = require('mongoose');

const moderationCaseSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      required: true,
      enum: ['opportunity', 'user', 'message'],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reportCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'dismissed'],
      default: 'open',
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reportIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report',
      },
    ],
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

moderationCaseSchema.index({ targetId: 1, targetType: 1 }, { unique: true });
moderationCaseSchema.index({ status: 1 });

module.exports = mongoose.model('ModerationCase', moderationCaseSchema);
