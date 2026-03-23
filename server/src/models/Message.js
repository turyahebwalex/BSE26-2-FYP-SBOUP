const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  applicationRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
  },
  content: { type: String, required: true },
  attachments: [
    {
      fileName: String,
      fileUrl: String,
      fileSize: Number,
    },
  ],
  readStatus: { type: Boolean, default: false },
  sentAt: { type: Date, default: Date.now },
});

messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ applicationRef: 1 });
messageSchema.index({ receiverId: 1, readStatus: 1 });

module.exports = mongoose.model('Message', messageSchema);
