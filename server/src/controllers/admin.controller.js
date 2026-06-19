const User = require('../models/User');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Report = require('../models/Report');
const Message = require('../models/Message');
const Profile = require('../models/Profile');
const ModerationCase = require('../models/ModerationCase');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const opportunityController = require('./opportunity.controller');
const notificationService = require('../services/notification.service'); 

exports.getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, activeUsers, totalOpportunities, pendingReviews, reports] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ accountStatus: 'active' }),
      Opportunity.countDocuments({ status: 'published' }),
      Opportunity.countDocuments({ status: 'under_review' }),
      Report.countDocuments({ status: 'pending' }),
    ]);

    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);

    const recentRegistrations = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('fullName email role createdAt');

    res.json({
      stats: { totalUsers, activeUsers, totalOpportunities, pendingReviews, pendingReports: reports },
      usersByRole,
      recentRegistrations,
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
  }
};

exports.getFlaggedContent = async (req, res) => {
  try {
    const flagged = await Opportunity.find({ status: 'under_review' })
      .populate('postedByUserId', 'fullName email')
      .populate('companyId', 'name verificationStatus')
      .sort({ createdAt: -1 });

    const reports = await Report.find({ status: 'pending' })
      .populate('reporterId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json({ flaggedOpportunities: flagged, pendingReports: reports });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch flagged content.' });
  }
};

exports.moderateContent = async (req, res) => {
  try {
    const { contentId, action, contentType, reason } = req.body;

    let responseMessage = 'Content moderated successfully.';
    const auditNotes = [];

    if (contentType === 'opportunity') {
      const existing = await Opportunity.findById(contentId).select('status postedByUserId');
      if (!existing) return res.status(404).json({ error: 'Opportunity not found.' });

      const update = action === 'approve' ? { status: 'published' } : { status: 'blocked' };
      const updated = await Opportunity.findByIdAndUpdate(contentId, update, { new: true });
      if (!updated) return res.status(404).json({ error: 'Opportunity not found.' });

      if (action === 'approve' && existing.status !== 'published') {
        setImmediate(async () => {
          try {
            await opportunityController.onOpportunityPublished(updated);
          } catch (err) {
            logger.warn(`onOpportunityPublished fan-out: ${err.message}`);
          }
        });
      }

      responseMessage = `Opportunity ${action === 'approve' ? 'restored' : 'removed'} successfully.`;
      auditNotes.push(`Opportunity status changed from ${existing.status} to ${updated.status}`);
    } else if (contentType === 'user') {
      const existing = await User.findById(contentId).select('accountStatus fullName email');
      if (!existing) return res.status(404).json({ error: 'User not found.' });

      let update = {};
      let notificationMessage = '';

      if (action === 'warn') {
        notificationMessage = reason || 'Your account has received a warning for violating our policies.';
      } else if (action === 'suspend') {
        update.accountStatus = 'suspended';
        notificationMessage = reason || 'Your account has been suspended for violating our policies.';
      } else if (action === 'deactivate' || action === 'remove' || action === 'ban') {
        update.accountStatus = 'deactivated';
        notificationMessage = reason || 'Your account has been deactivated for violating our policies.';
      } else if (action === 'reactivate' || action === 'restore') {
        update.accountStatus = 'active';
        notificationMessage = 'Your account has been reactivated.';
      } else {
        return res.status(400).json({ error: 'Unsupported user moderation action.' });
      }

      if (Object.keys(update).length > 0) {
        await User.findByIdAndUpdate(contentId, update);
      }

      if (notificationMessage) {
        await notificationService.create({
          userId: contentId,
          type: 'moderation',
          title: `Account ${action === 'warn' ? 'Warning' : action === 'suspend' ? 'Suspension' : 'Deactivation'}`,
          content: notificationMessage,
          metadata: {
            adminId: req.user._id,
            action,
            reason: reason || '',
          },
        });
      }

      const statusLabel = action === 'warn' ? 'warned' : action === 'suspend' ? 'suspended' : 'deactivated';
      responseMessage = `User ${statusLabel} successfully.`;
      auditNotes.push(`User account ${statusLabel}`);
    } else if (contentType === 'message') {
      const existing = await Message.findById(contentId).select('moderationStatus senderId receiverId');
      if (!existing) return res.status(404).json({ error: 'Message not found.' });

      let update = {};
      if (action === 'remove') {
        update.moderationStatus = 'blocked';
      } else if (action === 'restore') {
        update.moderationStatus = 'normal';
      } else if (action === 'under_review') {
        update.moderationStatus = 'under_review';
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Unsupported message moderation action.' });
      }

      await Message.findByIdAndUpdate(contentId, update);
      responseMessage = `Message ${action === 'remove' ? 'removed' : action === 'restore' ? 'restored' : 'marked for review'} successfully.`;
      auditNotes.push(`Message moderationStatus set to ${update.moderationStatus}`);
    } else {
      return res.status(400).json({ error: 'Unsupported content type.' });
    }

    const auditTargetType = contentType === 'user' ? 'user' : contentType === 'message' ? 'message' : 'opportunity';
    await AuditLog.create({
      adminId: req.user._id,
      action,
      targetType: auditTargetType,
      targetId: contentId,
      notes: auditNotes.join('; '),
      metadata: { contentType, action, reason: reason || '' },
    });

    logger.info(`Admin ${req.user._id} performed ${action} on ${contentType} ${contentId}`);
    res.json({ message: responseMessage });
  } catch (error) {
    logger.error('Moderate content error:', error);
    res.status(500).json({ error: 'Failed to moderate content.' });
  }
};

exports.getModerationCases = async (req, res) => {
  try {
    const cases = await ModerationCase.find({ status: { $in: ['open', 'under_review'] } })
      .populate('assignedAdmin', 'fullName email')
      .sort({ updatedAt: -1 });

    res.json({ cases });
  } catch (error) {
    logger.error('Get moderation cases error:', error);
    res.status(500).json({ error: 'Failed to fetch moderation cases.' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.accountStatus = status;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);

    res.json({ users, pagination: { page: Number(page), limit: Number(limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
};

exports.getRegistrationTrends = async (req, res) => {
  try {
    const { range = '30d', granularity = 'day' } = req.query;
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const fmt = granularity === 'week' ? '%G-W%V' : '%Y-%m-%d';

    const trends = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: fmt, date: '$createdAt' } },
            role: '$role',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.period',
          byRole: { $push: { role: '$_id.role', count: '$count' } },
          total: { $sum: '$count' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ range, granularity, trends });
  } catch (error) {
    logger.error('Registration trends error:', error);
    res.status(500).json({ error: 'Failed to fetch registration trends.' });
  }
};

exports.getUserTypeDistribution = async (req, res) => {
  try {
    const distribution = await User.aggregate([
      { $group: { _id: { role: '$role', status: '$accountStatus' }, count: { $sum: 1 } } },
      {
        $group: {
          _id: '$_id.role',
          byStatus: { $push: { status: '$_id.status', count: '$count' } },
          total: { $sum: '$count' },
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({ distribution });
  } catch (error) {
    logger.error('User type distribution error:', error);
    res.status(500).json({ error: 'Failed to fetch user type distribution.' });
  }
};

exports.getUrgentAlerts = async (req, res) => {
  try {
    const fraudHigh = Number(process.env.FRAUD_HIGH_THRESHOLD || 70);
    const [highRiskOpportunities, pendingReports, lockedAccounts, unverifiedCompanies] = await Promise.all([
      Opportunity.find({ fraudRiskScore: { $gte: fraudHigh } })
        .sort({ fraudRiskScore: -1, createdAt: -1 })
        .limit(20)
        .populate('postedByUserId', 'fullName email')
        .populate('companyId', 'name'),
      Report.countDocuments({ status: 'pending' }),
      User.countDocuments({ accountStatus: 'locked' }),
      require('../models/Company').countDocuments({ verificationStatus: { $in: ['unverified', 'pending'] } }),
    ]);

    res.json({
      alerts: {
        highRiskOpportunities,
        counts: {
          pendingReports,
          lockedAccounts,
          unverifiedCompanies,
          highRiskOpportunities: highRiskOpportunities.length,
        },
      },
    });
  } catch (error) {
    logger.error('Urgent alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch urgent alerts.' });
  }
};

exports.getUserDensity = async (req, res) => {
  try {
    const density = await Profile.aggregate([
      { $match: { location: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$location', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 },
      { $project: { _id: 0, location: '$_id', count: 1 } },
    ]);

    res.json({ density });
  } catch (error) {
    logger.error('User density error:', error);
    res.status(500).json({ error: 'Failed to fetch user density.' });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { accountStatus, role } = req.body;
    const update = {};
    if (accountStatus) update.accountStatus = accountStatus;
    if (role) update.role = role;

    const user = await User.findByIdAndUpdate(req.params.userId, update, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    logger.info(`Admin ${req.user._id} updated user ${req.params.userId}: ${JSON.stringify(update)}`);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user.' });
  }
};