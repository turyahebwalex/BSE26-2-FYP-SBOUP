const mongoose = require('mongoose');
const User = require('../models/User');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Report = require('../models/Report');
const Profile = require('../models/Profile');
const FraudLog = require('../models/FraudLog');
const attachModerationExplanation = require('../utils/attachModerationExplanation');
const logger = require('../utils/logger');

const FRAUD_LOW = parseInt(process.env.FRAUD_LOW_THRESHOLD, 10) || 30;
const FRAUD_HIGH = parseInt(process.env.FRAUD_HIGH_THRESHOLD, 10) || 70;

exports.getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, activeUsers, totalOpportunities, pendingReviews, reports] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ accountStatus: 'active' }),
      Opportunity.countDocuments({ status: 'published' }),
      Opportunity.countDocuments({ status: { $in: ['under_review', 'suspended'] } }),
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

const employerModerationStats = async (opportunityDocs) => {
  const ids = [
    ...new Set(
      opportunityDocs
        .map((o) => {
          const p = o.postedByUserId;
          if (!p) return null;
          return p._id ? String(p._id) : String(p);
        })
        .filter(Boolean)
    ),
  ];
  if (ids.length === 0) return new Map();

  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  const [users, agg] = await Promise.all([
    User.find({ _id: { $in: oids } }).select('createdAt').lean(),
    Opportunity.aggregate([
      { $match: { postedByUserId: { $in: oids } } },
      {
        $group: {
          _id: '$postedByUserId',
          totalPostings: { $sum: 1 },
          blockedPostings: {
            $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const statMap = new Map(
    agg.map((row) => [
      String(row._id),
      { totalPostings: row.totalPostings, blockedPostings: row.blockedPostings },
    ])
  );

  const out = new Map();
  for (const id of ids) {
    const u = userMap.get(id);
    const s = statMap.get(id) || { totalPostings: 0, blockedPostings: 0 };
    const created = u?.createdAt ? new Date(u.createdAt) : null;
    const accountAgeDays =
      created != null ? Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000)) : null;
    out.set(id, {
      accountAgeDays,
      previousPostings: Math.max(0, (s.totalPostings || 0) - 1),
      blockedCount: s.blockedPostings || 0,
    });
  }
  return out;
};

const attachEmployerModerationMeta = async (opportunityDocs) => {
  const stats = await employerModerationStats(opportunityDocs);
  return opportunityDocs.map((o) => {
    const plain = o.toObject ? o.toObject() : { ...o };
    const uid = plain.postedByUserId?._id || plain.postedByUserId;
    if (uid) {
      plain.employerModerationMeta = stats.get(String(uid)) || null;
    }
    return plain;
  });
};

exports.getFlaggedContent = async (req, res) => {
  try {
    const populatePaths = [
      { path: 'postedByUserId', select: 'fullName email createdAt' },
      { path: 'companyId', select: 'name verificationStatus' },
    ];

    const [underReview, suspended, pendingAppeals, reports] = await Promise.all([
      Opportunity.find({ status: 'under_review' }).populate(populatePaths).sort({ createdAt: -1 }),
      Opportunity.find({ status: 'suspended' }).populate(populatePaths).sort({ updatedAt: -1 }),
      Opportunity.find({ 'appeal.status': 'pending' }).populate(populatePaths).sort({ 'appeal.submittedAt': -1 }),
      Report.find({ status: 'pending' }).populate('reporterId', 'fullName email').sort({ createdAt: -1 }),
    ]);

    const [flaggedPlain, suspendedPlain, appealsPlain] = await Promise.all([
      attachEmployerModerationMeta(underReview),
      attachEmployerModerationMeta(suspended),
      attachEmployerModerationMeta(pendingAppeals),
    ]);

    const [flaggedWithExplanation, suspendedWithExplanation, appealsWithExplanation] = await Promise.all([
      attachModerationExplanation(flaggedPlain),
      attachModerationExplanation(suspendedPlain),
      attachModerationExplanation(appealsPlain),
    ]);

    res.json({
      flaggedOpportunities: flaggedWithExplanation,
      suspendedOpportunities: suspendedWithExplanation,
      pendingAppeals: appealsWithExplanation,
      pendingReports: reports,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch flagged content.' });
  }
};

exports.getFraudInsights = async (req, res) => {
  try {
    const { range = '30d', granularity = 'day' } = req.query;
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const fmt = granularity === 'week' ? '%G-W%V' : '%Y-%m-%d';

    const [summary, breakdown, trends, recentLogs] = await Promise.all([
      FraudLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            totalLogs: { $sum: 1 },
            averageScore: { $avg: '$fraudScore' },
            autoPublished: {
              $sum: { $cond: [{ $eq: ['$decisionOutcome', 'published'] }, 1, 0] },
            },
            underReview: {
              $sum: { $cond: [{ $eq: ['$decisionOutcome', 'under_review'] }, 1, 0] },
            },
            blocked: {
              $sum: { $cond: [{ $eq: ['$decisionOutcome', 'blocked'] }, 1, 0] },
            },
            modelPredictions: {
              $sum: { $cond: [{ $eq: ['$source', 'model'] }, 1, 0] },
            },
            workflowDecisions: {
              $sum: { $cond: [{ $eq: ['$source', 'workflow'] }, 1, 0] },
            },
            adminActions: {
              $sum: { $cond: [{ $eq: ['$source', 'admin'] }, 1, 0] },
            },
          },
        },
      ]),
      FraudLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$decisionOutcome',
            count: { $sum: 1 },
            averageScore: { $avg: '$fraudScore' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      FraudLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              period: { $dateToString: { format: fmt, date: '$createdAt' } },
              decisionOutcome: '$decisionOutcome',
            },
            count: { $sum: 1 },
            averageScore: { $avg: '$fraudScore' },
          },
        },
        {
          $group: {
            _id: '$_id.period',
            byDecision: { $push: { decisionOutcome: '$_id.decisionOutcome', count: '$count' } },
            total: { $sum: '$count' },
            averageScore: { $avg: '$averageScore' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      FraudLog.find({ createdAt: { $gte: since } })
        .populate('opportunityId', 'title status')
        .populate('adminId', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(25),
    ]);

    const totals = summary[0] || {
      totalLogs: 0,
      averageScore: 0,
      autoPublished: 0,
      underReview: 0,
      blocked: 0,
      modelPredictions: 0,
      workflowDecisions: 0,
      adminActions: 0,
    };

    res.json({
      range,
      granularity,
      thresholds: { low: FRAUD_LOW, high: FRAUD_HIGH },
      summary: totals,
      breakdown,
      trends,
      recentLogs,
    });
  } catch (error) {
    logger.error('Fraud insights error:', error);
    res.status(500).json({ error: 'Failed to fetch fraud insights.' });
  }
};

exports.moderateContent = async (req, res) => {
  try {
    const { contentId, action, contentType, feedback } = req.body;
    // action: approve | suspend (temporary, pending appeal) | remove (permanent block)

    if (contentType === 'opportunity') {
      let update;
      if (action === 'approve') update = { status: 'published' };
      else if (action === 'suspend') update = { status: 'suspended' };
      else if (action === 'remove') update = { status: 'blocked' };
      else {
        return res.status(400).json({ error: 'Invalid action. Use approve, suspend, or remove.' });
      }

      const opportunity = await Opportunity.findByIdAndUpdate(contentId, update, { new: true });
      if (opportunity) {
        const verb =
          action === 'approve' ? 'approved' : action === 'suspend' ? 'suspended' : 'blocked';
        await FraudLog.create({
          opportunityId: opportunity._id,
          source: 'admin',
          stage: 'moderation',
          fraudScore: opportunity.fraudRiskScore || 0,
          classification:
            opportunity.fraudRiskScore >= FRAUD_HIGH
              ? 'High Risk'
              : opportunity.fraudRiskScore >= FRAUD_LOW
                ? 'Medium Risk'
                : 'Low Risk',
          decisionOutcome: opportunity.status,
          decisionReason: `Admin ${verb} opportunity during manual review.`,
          thresholds: { low: FRAUD_LOW, high: FRAUD_HIGH },
          features: { fraudSignals: opportunity.fraudSignals || [] },
          signals: opportunity.fraudSignals || [],
          adminId: req.user._id,
          adminAction: action === 'approve' ? 'approve' : action === 'suspend' ? 'suspend' : 'reject',
          adminFeedback: feedback || '',
          explanation: feedback || '',
        });
      }
    }

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

exports.getArchivedOpportunities = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'archived', search } = req.query;
    const filter = { status };
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [opportunities, total] = await Promise.all([
      Opportunity.find(filter)
        .populate('postedByUserId', 'fullName email')
        .populate('companyId', 'name verificationStatus')
        .populate('requiredSkills', 'skillName')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Opportunity.countDocuments(filter),
    ]);

    res.json({
      opportunities,
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (error) {
    logger.error('Get archived opportunities error:', error);
    res.status(500).json({ error: 'Failed to fetch archived opportunities.' });
  }
};

exports.restoreArchivedOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findOneAndUpdate(
      { _id: req.params.id, status: 'archived' },
      { status: 'published' },
      { new: true }
    ).populate('postedByUserId', 'fullName email');

    if (!opportunity) {
      return res.status(404).json({ error: 'Archived opportunity not found.' });
    }

    // Log the restoration action
    await FraudLog.create({
      opportunityId: opportunity._id,
      source: 'admin',
      stage: 'restoration',
      fraudScore: opportunity.fraudRiskScore || 0,
      classification: opportunity.fraudRiskScore >= FRAUD_HIGH 
        ? 'High Risk' 
        : opportunity.fraudRiskScore >= FRAUD_LOW 
          ? 'Medium Risk' 
          : 'Low Risk',
      decisionOutcome: 'published',
      decisionReason: 'Admin restored archived opportunity to published status.',
      thresholds: { low: FRAUD_LOW, high: FRAUD_HIGH },
      features: { fraudSignals: opportunity.fraudSignals || [] },
      signals: opportunity.fraudSignals || [],
      adminId: req.user._id,
      adminAction: 'restore',
      adminFeedback: '',
      explanation: 'Archived opportunity was restored by administrator.',
    });

    logger.info(`Admin ${req.user._id} restored archived opportunity ${req.params.id}`);
    res.json({ 
      message: 'Opportunity restored successfully.', 
      opportunity 
    });
  } catch (error) {
    logger.error('Restore archived opportunity error:', error);
    res.status(500).json({ error: 'Failed to restore opportunity.' });
  }
};

exports.permanentlyRemoveOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findOneAndDelete({
      _id: req.params.id,
      status: { $in: ['archived', 'blocked'] }
    });

    if (!opportunity) {
      return res.status(404).json({ 
        error: 'Opportunity not found or cannot be permanently removed.' 
      });
    }

    // Log the permanent removal action
    await FraudLog.create({
      opportunityId: opportunity._id,
      source: 'admin',
      stage: 'permanent_removal',
      fraudScore: opportunity.fraudRiskScore || 0,
      classification: opportunity.fraudRiskScore >= FRAUD_HIGH 
        ? 'High Risk' 
        : opportunity.fraudRiskScore >= FRAUD_LOW 
          ? 'Medium Risk' 
          : 'Low Risk',
      decisionOutcome: 'permanently_removed',
      decisionReason: 'Admin permanently removed opportunity.',
      thresholds: { low: FRAUD_LOW, high: FRAUD_HIGH },
      features: { fraudSignals: opportunity.fraudSignals || [] },
      signals: opportunity.fraudSignals || [],
      adminId: req.user._id,
      adminAction: 'permanent_remove',
      adminFeedback: '',
      explanation: 'Opportunity was permanently removed by administrator.',
    });

    logger.info(`Admin ${req.user._id} permanently removed opportunity ${req.params.id}`);
    res.json({ 
      message: 'Opportunity permanently removed.' 
    });
  } catch (error) {
    logger.error('Permanently remove opportunity error:', error);
    res.status(500).json({ error: 'Failed to permanently remove opportunity.' });
  }
};

exports.getAppealsQueue = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'pending' } = req.query;
    const filter = { 'appeal.status': status };

    const skip = (Number(page) - 1) * Number(limit);
    const [opportunities, total] = await Promise.all([
      Opportunity.find(filter)
        .populate('postedByUserId', 'fullName email')
        .populate('companyId', 'name verificationStatus')
        .populate('requiredSkills', 'skillName')
        .sort({ 'appeal.submittedAt': -1 })
        .skip(skip)
        .limit(Number(limit)),
      Opportunity.countDocuments(filter),
    ]);

    res.json({
      appeals: opportunities,
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (error) {
    logger.error('Get appeals queue error:', error);
    res.status(500).json({ error: 'Failed to fetch appeals queue.' });
  }
};

exports.reviewAppeal = async (req, res) => {
  try {
    const { action, adminNote } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be approve or reject.' });
    }

    const opportunity = await Opportunity.findOne({
      _id: req.params.id,
      'appeal.status': 'pending'
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Pending appeal not found.' });
    }

    // Update appeal status
    opportunity.appeal.status = action === 'approve' ? 'approved' : 'rejected';
    opportunity.appeal.reviewedAt = new Date();
    opportunity.appeal.reviewedBy = req.user._id;
    opportunity.appeal.adminNote = adminNote || '';

    // Update opportunity status based on appeal decision
    if (action === 'approve') {
      opportunity.status = 'published'; // Restore the posting
    }

    await opportunity.save();

    // Log the appeal review action
    await FraudLog.create({
      opportunityId: opportunity._id,
      source: 'admin',
      stage: 'appeal_review',
      fraudScore: opportunity.fraudRiskScore || 0,
      classification: opportunity.fraudRiskScore >= FRAUD_HIGH 
        ? 'High Risk' 
        : opportunity.fraudRiskScore >= FRAUD_LOW 
          ? 'Medium Risk' 
          : 'Low Risk',
      decisionOutcome: opportunity.status,
      decisionReason: `Admin ${action}d appeal. ${adminNote ? `Note: ${adminNote}` : ''}`,
      thresholds: { low: FRAUD_LOW, high: FRAUD_HIGH },
      features: { 
        fraudSignals: opportunity.fraudSignals || [],
        appealReason: opportunity.appeal.reason,
        appealDecision: action,
        adminNote: adminNote
      },
      signals: opportunity.fraudSignals || [],
      adminId: req.user._id,
      adminAction: `appeal_${action}`,
      adminFeedback: adminNote || '',
      explanation: `Appeal ${action}d by administrator. ${adminNote ? `Admin note: ${adminNote}` : ''}`,
    });

    logger.info(`Admin ${req.user._id} ${action}d appeal for opportunity ${req.params.id}`);
    res.json({ 
      message: `Appeal ${action}d successfully.`, 
      opportunity 
    });
  } catch (error) {
    logger.error('Review appeal error:', error);
    res.status(500).json({ error: 'Failed to review appeal.' });
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
