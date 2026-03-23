const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const filter = { userId: req.user._id };
    if (type) filter.type = type;

    const skip = (Number(page) - 1) * Number(limit);
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user._id, isRead: false }),
    ]);

    res.json({ notifications, unreadCount, pagination: { page: Number(page), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true }
    );
    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notifications.' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ message: 'Notification deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification.' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread count.' });
  }
};
