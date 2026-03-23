const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const setupSocketIO = (io) => {
  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId}`);

    // Join personal room for notifications
    socket.join(`user:${socket.userId}`);

    // ─── Messaging Events ───
    socket.on('message:send', async (data) => {
      const { receiverId, content, applicationRef, attachments } = data;
      // Emit to receiver's room
      io.to(`user:${receiverId}`).emit('message:receive', {
        senderId: socket.userId,
        content,
        applicationRef,
        attachments,
        sentAt: new Date(),
      });
    });

    socket.on('message:typing', (data) => {
      io.to(`user:${data.receiverId}`).emit('message:typing', {
        senderId: socket.userId,
      });
    });

    // ─── Chatbot Events ───
    socket.on('chatbot:query', async (data) => {
      // Forward to chatbot service via REST and stream response
      socket.emit('chatbot:response', {
        message: 'Processing your query...',
        isLoading: true,
      });
    });

    // ─── Notification Events ───
    socket.on('notification:read', (data) => {
      // Mark notification as read
    });

    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.userId}`);
    });
  });

  return io;
};

// Utility to send notification via Socket.IO
const sendNotification = (io, userId, notification) => {
  io.to(`user:${userId}`).emit('notification:new', notification);
};

module.exports = { setupSocketIO, sendNotification };
