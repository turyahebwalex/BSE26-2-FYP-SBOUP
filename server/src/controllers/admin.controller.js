const User = require('../models/User');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Report = require('../models/Report');
const logger = require('../utils/logger');

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
      .populate('employerId', 'fullName email')
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
    const { contentId, action, contentType } = req.body; // action: approve, remove, ban

    if (contentType === 'opportunity') {
      const update = action === 'approve' ? { status: 'published' } : { status: 'blocked' };
      await Opportunity.findByIdAndUpdate(contentId, update);
    }

    // Log admin action
    logger.info(`Admin ${req.user._id} performed ${action} on ${contentType} ${contentId}`);

    res.json({ message: `Content ${action}d successfully.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to moderate content.' });
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
