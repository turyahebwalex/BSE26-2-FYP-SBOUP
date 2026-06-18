const mongoose = require('mongoose');

const otpRequestSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    lowercase: true,
    index: true 
  },
  otp: { 
    type: String, 
    required: true 
  },
  channel: { 
    type: String, 
    enum: ['email'], 
    default: 'email' 
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000),
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Auto-delete expired OTPs
otpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OtpRequest', otpRequestSchema);