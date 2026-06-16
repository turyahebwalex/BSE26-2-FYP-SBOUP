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
  content: { 
    type: String, 
    default: '',  // Changed from 'required: true' to allow attachment-only messages
  },
  attachments: [
    {
      fileName: String,
      fileUrl: String,
      fileSize: Number,
      fileType: String,  // ADD THIS - for frontend rendering (image, pdf, doc, etc.)
      mimeType: String,  // ADD THIS - for proper file handling
    },
  ],
  readStatus: { 
    type: Boolean, 
    default: false 
  },
  deliveredStatus: {   // ADD THIS - track if message reached receiver's device
    type: Boolean, 
    default: false 
  },
  status: {            // ADD THIS - message lifecycle tracking
    type: String, 
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  moderationStatus: {
    type: String,
    enum: ['normal', 'under_review', 'blocked'],
    default: 'normal',
  },
  sentAt: { 
    type: Date, 
    default: Date.now 
  },
  deletedBy: [{        // ADD THIS - soft delete for individual users
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  replyTo: {           // ADD THIS - for reply feature (optional but good)
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }
});

// Existing indexes
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ applicationRef: 1 });
messageSchema.index({ receiverId: 1, readStatus: 1 });

// ADD THESE NEW INDEXES for better performance
messageSchema.index({ senderId: 1, sentAt: -1 });
messageSchema.index({ receiverId: 1, sentAt: -1 });
messageSchema.index({ status: 1 });
messageSchema.index({ deletedBy: 1 });

// ADD THIS - virtual for isAttachment (convenience)
messageSchema.virtual('hasAttachments').get(function() {
  return this.attachments && this.attachments.length > 0;
});

// ADD THIS - to automatically update status when read
messageSchema.methods.markAsRead = async function() {
  if (!this.readStatus) {
    this.readStatus = true;
    this.status = 'read';
    await this.save();
  }
  return this;
};

// ADD THIS - to mark as delivered
messageSchema.methods.markAsDelivered = async function() {
  if (!this.deliveredStatus) {
    this.deliveredStatus = true;
    if (this.status === 'sent') {
      this.status = 'delivered';
    }
    await this.save();
  }
  return this;
};

module.exports = mongoose.model('Message', messageSchema);