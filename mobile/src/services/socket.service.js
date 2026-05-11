class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set of socket ids
  }

  initialize(io) {
    this.io = io;
  }

  // Send to specific user via their room
  sendToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  // Send to specific conversation room
  sendToConversation(conversationId, event, data) {
    if (this.io) {
      this.io.to(`conversation:${conversationId}`).emit(event, data);
    }
  }

  // Broadcast to all connected users
  broadcast(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  // Track user's socket connection
  addUserSocket(userId, socketId) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socketId);
  }

  // Remove user's socket connection
  removeUserSocket(userId, socketId) {
    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socketId);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  // Get online status of user
  isUserOnline(userId) {
    return this.userSockets.has(userId);
  }

  // Get online users list
  getOnlineUsers() {
    return Array.from(this.userSockets.keys());
  }
}

module.exports = new SocketService();