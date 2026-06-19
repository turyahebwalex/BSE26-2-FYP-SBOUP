const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'message',
        'match',
        'application_update',
        'opportunity',
        'learning',
        'fraud_alert',
        'system',
        'connection_request',
        'reminder',
        'mention',
        'job_alert',
        'moderation' 
      ],
      required: true,
    },
    title: { type: String, trim: true, maxlength: 100 },
    content: { type: String, required: true, maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Index for efficient unread count queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);