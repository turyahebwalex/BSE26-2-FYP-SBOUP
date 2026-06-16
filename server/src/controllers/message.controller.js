const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { formatFileInfo, cleanupTempFiles } = require('../middleware/upload');

exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, content, applicationRef } = req.body;
    
    // ─── Process attachments from multer ─────────────────────────
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => formatFileInfo(file));
    } else if (req.body.attachments) {
      // Fallback for JSON attachments (if not using multer)
      attachments = typeof req.body.attachments === 'string' 
        ? JSON.parse(req.body.attachments) 
        : req.body.attachments;
      
      // Validate file sizes
      for (const att of attachments) {
        if (att.fileSize > 10 * 1024 * 1024) {
          return res.status(400).json({ error: 'Attachment exceeds 10MB limit.' });
        }
      }
    }

    // Check if message has content OR attachments
    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message must have content or attachments.' });
    }

    // Check if receiver has blocked the sender
    const receiver = await User.findById(receiverId);
    if (receiver && receiver.blockedUsers && receiver.blockedUsers.includes(req.user._id)) {
      return res.status(403).json({ error: 'You cannot message this user.' });
    }

    // Check if sender has blocked the receiver
    if (req.user.blockedUsers && req.user.blockedUsers.includes(receiverId)) {
      return res.status(403).json({ error: 'You have blocked this user.' });
    }

    const message = await Message.create({
      senderId: req.user._id,
      receiverId,
      applicationRef: applicationRef || null,
      content: content || '',
      attachments: attachments || [],
      status: 'sent',
      sentAt: new Date()
    });

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'fullName email role avatar isOnline lastSeenAt')
      .populate('receiverId', 'fullName email role avatar isOnline lastSeenAt')
      .lean();

    // Create notification for receiver
    const notificationContent = attachments && attachments.length > 0
      ? `${req.user.fullName} sent you ${attachments.length} attachment(s)`
      : `${req.user.fullName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`;
    
    await Notification.create({
      userId: receiverId,
      type: 'message',
      title: 'New Message',
      content: notificationContent,
      metadata: { 
        messageId: message._id,
        senderId: req.user._id,
        senderName: req.user.fullName
      },
    });

    // Format response
    const formattedMessage = {
      ...populatedMessage,
      sender: populatedMessage.senderId,
      receiver: populatedMessage.receiverId,
      attachments: populatedMessage.attachments,
    };

    // Emit real-time event via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(receiverId.toString()).emit('new_message', { message: formattedMessage });
      
      const unreadCount = await Message.countDocuments({
        receiverId: receiverId,
        readStatus: false
      });
      io.to(receiverId.toString()).emit('unread_count_update', { 
        unreadCount,
        conversationWith: req.user._id
      });
      
      io.to(req.user._id.toString()).emit('message_sent', {
        message: formattedMessage,
        tempId: req.body.tempId
      });
    }

    // Clean up temp files if using multer
    if (req.files && req.files.length > 0) {
      await cleanupTempFiles(req.files);
    }

    res.status(201).json({
      success: true,
      message: formattedMessage,
    });
  } catch (error) {
    console.error('Send message error:', error);
    if (req.files) await cleanupTempFiles(req.files);
    res.status(500).json({ error: error.message || 'Failed to send message.' });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    // Get messages between the two users
    const messages = await Message.find({
      $or: [
        { senderId: req.user._id, receiverId: userId },
        { senderId: userId, receiverId: req.user._id },
      ],
      deletedBy: { $ne: req.user._id }, // Exclude deleted messages
      moderationStatus: 'normal',
    })
      .sort({ sentAt: -1 }) // Get newest first for pagination
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('senderId', 'fullName email role avatar isOnline lastSeenAt')
      .populate('receiverId', 'fullName email role avatar isOnline lastSeenAt')
      .lean();

    // Get unread messages that belong to current user
    const unreadMessageIds = messages
      .filter(msg => 
        msg.receiverId._id.toString() === req.user._id.toString() && 
        !msg.readStatus
      )
      .map(msg => msg._id);
    
    // Mark unread messages as read
    if (unreadMessageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessageIds } },
        { 
          readStatus: true, 
          status: 'read',
          readAt: new Date()
        }
      );
      
      // Notify sender that messages were read
      const io = req.app.get('io');
      if (io) {
        io.to(userId.toString()).emit('messages_read', { 
          messageIds: unreadMessageIds, 
          readerId: req.user._id,
          conversationId: userId
        });
      }
    }

    // Format messages (reverse to get chronological order)
    const formattedMessages = messages.map((msg) => ({
      ...msg,
      sender: msg.senderId,
      receiver: msg.receiverId,
      isOwnMessage: msg.senderId._id.toString() === req.user._id.toString(),
    })).reverse();

    // Get total count for pagination
    const total = await Message.countDocuments({
      $or: [
        { senderId: req.user._id, receiverId: userId },
        { senderId: userId, receiverId: req.user._id },
      ],
      deletedBy: { $ne: req.user._id },
      moderationStatus: 'normal',
    });

    res.json({ 
      success: true,
      messages: formattedMessages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalMessages: total,
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
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
          deletedBy: { $ne: userId },
          moderationStatus: 'normal',
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

    const otherIds = grouped.map((g) => g._id);
    const users = await User.find({ _id: { $in: otherIds } })
      .select('fullName email role avatar isOnline lastSeenAt')
      .lean();
    
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const conversations = grouped.map((g) => {
      const otherUser = userMap.get(g._id.toString());
      return {
        otherUser: {
          _id: otherUser?._id || g._id,
          fullName: otherUser?.fullName || 'Unknown User',
          email: otherUser?.email,
          role: otherUser?.role,
          avatar: otherUser?.avatar,
          isOnline: otherUser?.isOnline || false,
          lastSeenAt: otherUser?.lastSeenAt,
          lastSeenFormatted: otherUser?.getLastSeenFormatted?.() || 'Unknown',
        },
        lastMessage: {
          _id: g.lastMessage._id,
          content: g.lastMessage.content,
          attachments: g.lastMessage.attachments,
          sentAt: g.lastMessage.sentAt,
          readStatus: g.lastMessage.readStatus,
          status: g.lastMessage.status,
          senderId: g.lastMessage.senderId,
          receiverId: g.lastMessage.receiverId,
        },
        unreadCount: g.unreadCount,
        updatedAt: g.lastMessage?.sentAt,
      };
    });

    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Get inbox error:', error);
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

// NEW METHOD: Mark messages as delivered
exports.markAsDelivered = async (req, res) => {
  try {
    const { messageIds } = req.body;
    
    if (!messageIds || !messageIds.length) {
      return res.status(400).json({ error: 'Message IDs required' });
    }
    
    await Message.updateMany(
      { _id: { $in: messageIds }, receiverId: req.user._id },
      { deliveredStatus: true, status: 'delivered' }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as delivered' });
  }
};

// NEW METHOD: Mark messages as read (for bulk operations)
exports.markAsRead = async (req, res) => {
  try {
    const { messageIds } = req.body;
    
    if (!messageIds || !messageIds.length) {
      return res.status(400).json({ error: 'Message IDs required' });
    }
    
    const messages = await Message.find({ _id: { $in: messageIds } });
    const senderIds = [...new Set(messages.map(m => m.senderId.toString()))];
    
    await Message.updateMany(
      { _id: { $in: messageIds }, receiverId: req.user._id },
      { readStatus: true, status: 'read', readAt: new Date() }
    );
    
    // Notify senders that messages were read
    const io = req.app.get('io');
    if (io) {
      senderIds.forEach(senderId => {
        io.to(senderId).emit('messages_read', { 
          messageIds, 
          readerId: req.user._id 
        });
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};

// NEW METHOD: Typing indicator
exports.typingIndicator = async (req, res) => {
  try {
    const { receiverId, isTyping } = req.body;
    
    // Update user's typing status
    if (isTyping) {
      await req.user.setTyping(receiverId);
    }
    
    const io = req.app.get('io');
    if (io) {
      io.to(receiverId.toString()).emit('typing_status', {
        userId: req.user._id,
        userName: req.user.fullName,
        isTyping: isTyping || false,
        conversationId: receiverId
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send typing status' });
  }
};

// NEW METHOD: Delete message (soft delete)
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Add user to deletedBy array (soft delete)
    if (!message.deletedBy.includes(req.user._id)) {
      message.deletedBy.push(req.user._id);
      await message.save();
    }
    
    // Notify the other user
    const io = req.app.get('io');
    if (io) {
      const otherUserId = message.senderId.toString() === req.user._id.toString() 
        ? message.receiverId.toString() 
        : message.senderId.toString();
      
      io.to(otherUserId).emit('message_deleted', {
        messageId,
        deletedBy: req.user._id,
        forEveryone: false
      });
    }
    
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// NEW METHOD: Delete entire conversation
exports.deleteConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    
    await Message.updateMany(
      {
        $or: [
          { senderId: req.user._id, receiverId: userId },
          { senderId: userId, receiverId: req.user._id },
        ],
        deletedBy: { $ne: req.user._id }
      },
      { $push: { deletedBy: req.user._id } }
    );
    
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};