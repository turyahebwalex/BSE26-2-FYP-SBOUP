const Notification = require('../models/Notification');

// ────────────────────────────────────────────────────────────────────────────
// Create a notification (used internally by other services)
// ────────────────────────────────────────────────────────────────────────────
const createNotification = async (data) => {
  try {
    const notification = await Notification.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      content: data.content,
      metadata: data.metadata || {},
    });

    // Emit via Socket.IO if available
    if (global.io) {
      global.io.to(`user:${data.userId}`).emit('new_notification', {
        notification: {
          ...notification.toObject(),
          createdAt: notification.createdAt,
          isRead: false,
        },
        unreadCount: await Notification.countDocuments({ userId: data.userId, isRead: false }),
      });
    }

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Get user notifications (paginated)
// ────────────────────────────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await Notification.countDocuments({ userId });
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total,
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Mark single notification as read
// ────────────────────────────────────────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOne({ _id: notificationId, userId: req.user._id });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();

      // Emit updated unread count
      const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
      if (global.io) {
        global.io.to(`user:${req.user._id}`).emit('unread_count_update', { unreadCount });
      }
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Mark all notifications as read
// ────────────────────────────────────────────────────────────────────────────
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    const unreadCount = 0;

    if (global.io) {
      global.io.to(`user:${req.user._id}`).emit('unread_count_update', { unreadCount });
    }

    res.json({ success: true, unreadCount });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Delete a notification
// ────────────────────────────────────────────────────────────────────────────
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOneAndDelete({ _id: notificationId, userId: req.user._id });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
    if (global.io) {
      global.io.to(`user:${req.user._id}`).emit('unread_count_update', { unreadCount });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Helper to create notifications from other parts of the app
// ────────────────────────────────────────────────────────────────────────────
exports.createNotification = createNotification;