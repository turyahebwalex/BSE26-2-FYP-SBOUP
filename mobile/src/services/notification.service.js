const Notification = require('../models/Notification');

class NotificationService {
  constructor() {
    this.io = null;
  }

  registerIO(io) {
    this.io = io;
  }

  async sendNotification(userId, type, title, content, metadata = {}) {
    try {
      const notification = await Notification.create({
        userId,
        type,
        title,
        content,
        metadata,
        isRead: false,
        createdAt: new Date()
      });

      // Emit real-time notification via Socket.io
      if (this.io) {
        const unreadCount = await Notification.countDocuments({
          userId,
          isRead: false
        });
        
        this.io.to(`user:${userId}`).emit('new_notification', {
          notification,
          unreadCount
        });
      }

      return notification;
    } catch (error) {
      console.error('Error sending notification:', error);
      return null;
    }
  }

  async sendMessageNotification(receiverId, senderId, senderName, messageContent, messageId) {
    const title = 'New Message';
    const content = `${senderName}: ${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}`;
    
    return this.sendNotification(receiverId, 'message', title, content, {
      messageId,
      senderId,
      senderName,
      preview: messageContent.substring(0, 100)
    });
  }

  async sendApplicationNotification(userId, opportunityTitle, status, applicationId) {
    const statusMessages = {
      accepted: 'accepted',
      rejected: 'was not selected',
      pending: 'is under review',
      reviewed: 'has been reviewed'
    };
    
    const title = `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    const content = `Your application for "${opportunityTitle}" ${statusMessages[status] || `was ${status}`}.`;
    
    return this.sendNotification(userId, 'application_update', title, content, {
      applicationId,
      opportunityTitle,
      status
    });
  }
}

module.exports = new NotificationService();