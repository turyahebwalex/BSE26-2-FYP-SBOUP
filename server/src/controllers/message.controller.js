const Message = require('../models/Message');
const Notification = require('../models/Notification');

exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, content, applicationRef, attachments } = req.body;

    if (attachments) {
      for (const att of attachments) {
        if (att.fileSize > 10 * 1024 * 1024) {
          return res.status(400).json({ error: 'Attachment exceeds 10MB limit.' });
        }
      }
    }

    const message = await Message.create({
      senderId: req.user._id,
      receiverId,
      applicationRef,
      content,
      attachments: attachments || [],
    });

    await Notification.create({
      userId: receiverId,
      type: 'message',
      content: 'You have a new message.',
      metadata: { messageId: message._id },
    });

    res.status(201).json({ message });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await Message.find({
      $or: [
        { senderId: req.user._id, receiverId: userId },
        { senderId: userId, receiverId: req.user._id },
      ],
    }).sort({ sentAt: 1 });

    // Mark as read
    await Message.updateMany(
      { senderId: userId, receiverId: req.user._id, readStatus: false },
      { readStatus: true }
    );

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversation.' });
  }
};

exports.getInbox = async (req, res) => {
  try {
    const userId = req.user._id;
    const grouped = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: userId }, { receiverId: userId }],
        },
      },
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$senderId', userId] }, '$receiverId', '$senderId'],
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiverId', userId] },
                    { $eq: ['$readStatus', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { 'lastMessage.sentAt': -1 } },
    ]);

    const User = require('../models/User');
    const otherIds = grouped.map((g) => g._id);
    const users = await User.find({ _id: { $in: otherIds } })
      .select('fullName email role')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const conversations = grouped.map((g) => ({
      otherUser: userMap.get(g._id.toString()) || { _id: g._id, fullName: 'User' },
      lastMessage: g.lastMessage,
      unreadCount: g.unreadCount,
      updatedAt: g.lastMessage?.sentAt,
    }));

    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inbox.' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiverId: req.user._id,
      readStatus: false,
    });
    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread count.' });
  }
};
