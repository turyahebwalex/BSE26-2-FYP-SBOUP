const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetType: {
      type: String,
      required: true,
      enum: ['opportunity', 'user', 'message', 'company'],
    },
    reason: {
      type: String,
      required: true,
      enum: [
        'fraudulent_scam',
        'spam',
        'inappropriate_content',
        'fake_credentials',
        'payment_request',
        'other',
      ],
    },
    details: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'reviewed', 'action_taken', 'resolved', 'dismissed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.index({ targetId: 1, targetType: 1 });
reportSchema.index({ status: 1 });

module.exports = mongoose.model('Report', reportSchema);