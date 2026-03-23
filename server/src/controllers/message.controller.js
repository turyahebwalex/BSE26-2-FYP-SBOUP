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
    // Get latest message from each conversation
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: req.user._id }, { receiverId: req.user._id }],
        },
      },
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$senderId', req.user._id] }, '$receiverId', '$senderId'],
          },
          lastMessage: { $first: '$$ROOT' },
        },
      },
      { $sort: { 'lastMessage.sentAt': -1 } },
    ]);

    res.json({ conversations: messages });
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
