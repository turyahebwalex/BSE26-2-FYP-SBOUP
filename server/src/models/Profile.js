const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Professional title is required'],
      maxlength: 100,
    },
    bio: {
      type: String,
      maxlength: 1000,
    },
    portfolioItems: [
      {
        title: String,
        description: String,
        fileUrl: String,
        fileType: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    location: {
      type: String,
      maxlength: 100,
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
  },
  {
    timestamps: { updatedAt: 'updatedAt', createdAt: 'createdAt' },
  }
);

profileSchema.index({ userId: 1 });
profileSchema.index({ location: 1 });
profileSchema.index({ visibility: 1 });

module.exports = mongoose.model('Profile', profileSchema);
