const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * Single entry point for creating notifications. Persists to Mongo
 * and (if Socket.IO is wired) pushes the payload live to the user's
 * personal room for instant badge updates on web/mobile.
 */

let ioInstance = null;
const registerIO = (io) => {
  ioInstance = io;
};

const create = async ({ userId, type, content, metadata }) => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      content,
      metadata: metadata || {},
    });
    if (ioInstance) {
      ioInstance.to(`user:${userId}`).emit('notification:new', notification);
    }
    return notification;
  } catch (err) {
    logger.error('Notification create failed:', err.message);
    return null;
  }
};

module.exports = { registerIO, create };
