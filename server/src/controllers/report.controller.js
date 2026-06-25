const Report = require('../models/Report');
const Opportunity = require('../models/Opportunity');
const User = require('../models/User');
const Company = require('../models/Company');
const Message = require('../models/Message');
const ModerationCase = require('../models/ModerationCase');
const AuditLog = require('../models/AuditLog');
const Profile = require('../models/Profile');
const notificationService = require('../services/notification.service');

const AUTO_HIDE_WINDOW_MS = 48 * 60 * 60 * 1000;
const DUPLICATE_REPORT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const notifyAdmins = async (content, metadata = {}) => {
  try {
    const admins = await User.find({ role: 'admin', accountStatus: 'active' }).select('_id');
    await Promise.all(
      admins.map((admin) =>
        notificationService.create({
          userId: admin._id,
          type: 'moderation',
          title: 'New moderation report',
          content,
          metadata,
        })
      )
    );
  } catch (err) {
    console.error('Admin notification failed:', err.message);
  }
};

const getTargetDetails = async (targetType, targetId) => {
  try {
    if (!targetType || !targetId) return null;

    if (targetType === 'user') {
      const user = await User.findById(targetId).select('fullName email role phoneNumber accountStatus createdAt lastLoginAt companyId avatar');
      if (!user) return null;
      // For skilled workers, also fetch profile details
      if (user.role === 'skilled_worker') {
        const profile = await Profile.findOne({ userId: targetId }).select('title bio location portfolioItems');
        return {
          ...user.toObject(),
          profile: profile || null,
        };
      }
      return user;
    }
    if (targetType === 'message') {
      return await Message.findById(targetId)
        .populate('senderId', 'fullName name email avatar')
        .populate('receiverId', 'fullName name email avatar')
        .select('content attachments sentAt senderId receiverId');
    }
    if (targetType === 'opportunity') {
      return await Opportunity.findById(targetId)
        .select('title companyId status category location compensationRange deadline fraudRiskScore fraudSignals')
        .populate('companyId', 'name verificationStatus')
        .populate('postedByUserId', 'fullName email');
    }
    if (targetType === 'company') {
      const company = await Company.findById(targetId).select('name industry location verificationStatus logoUrl moderationStatus moderationNote description website contactEmail contactPhone userId createdAt trustScore');
      if (!company) return null;
      // Get open positions count and list
      const positions = await Opportunity.find({ companyId: targetId, status: 'published' })
        .select('title category location compensationRange status createdAt')
        .sort({ createdAt: -1 })
        .limit(20);
      // Get linked employers count
      const employerCount = await User.countDocuments({ companyId: targetId, role: 'employer' });
      return {
        ...company.toObject(),
        openPositions: positions,
        employerCount,
      };
    }
    return null;
  } catch (error) {
    return null;
  }
};

const normalizeReport = async (report) => {
  const reportObj = report.toObject ? report.toObject() : report;
  return {
    ...reportObj,
    targetDetails: await getTargetDetails(reportObj.targetType, reportObj.targetId),
  };
};

const logAudit = async (adminId, action, targetType, targetId, notes = '', metadata = {}) => {
  try {
    await AuditLog.create({ adminId, action, targetType, targetId, notes, metadata });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

const findTarget = async (targetType, targetId) => {
  if (targetType === 'opportunity') return Opportunity.findById(targetId);
  if (targetType === 'user') return User.findById(targetId);
  if (targetType === 'message') return Message.findById(targetId);
  if (targetType === 'company') return Company.findById(targetId);
  return null;
};

exports.createReport = async (req, res) => {
  try {
    const { targetType, targetId } = req.body;
    const target = await findTarget(targetType, targetId);
    if (!target) {
      return res.status(404).json({ error: 'Target content not found.' });
    }

    const existingRecent = await Report.findOne({
      reporterId: req.user._id,
      targetType,
      targetId,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_REPORT_WINDOW_MS) },
    });

    if (existingRecent) {
      return res.status(429).json({ error: 'You already reported this content recently.' });
    }

    const report = await Report.create({ reporterId: req.user._id, ...req.body });

    const recentCount = await Report.countDocuments({
      targetId,
      targetType,
      createdAt: { $gte: new Date(Date.now() - AUTO_HIDE_WINDOW_MS) },
    });

    await notifyAdmins(
      recentCount >= 3
        ? `A reported ${targetType} has reached ${recentCount} reports and was moved to admin review.`
        : `A new ${targetType} report has been submitted for review.`,
      {
        targetType,
        targetId: targetId.toString(),
        reportCount: recentCount,
        reportId: report._id.toString(),
      }
    );

    if (recentCount >= 3) {
      const existingCase = await ModerationCase.findOneAndUpdate(
        { targetType, targetId },
        {
          $set: { status: 'under_review' },
          $inc: { reportCount: 1 },
          $addToSet: { reportIds: report._id },
        },
        { new: true }
      );

      const moderationCase = existingCase ||
        await ModerationCase.create({
          targetType,
          targetId,
          reportCount: recentCount,
          status: 'under_review',
          reportIds: [report._id],
        });

      if (targetType === 'opportunity') {
        await Opportunity.findByIdAndUpdate(targetId, { status: 'under_review' });
      }

      if (targetType === 'user') {
        if (target.accountStatus === 'active') {
          await User.findByIdAndUpdate(targetId, { accountStatus: 'suspended' });
        }
      }

      if (targetType === 'message') {
        await Message.findByIdAndUpdate(targetId, { moderationStatus: 'under_review' });
      }

      if (targetType === 'company') {
        if (target.verificationStatus !== 'rejected') {
          await Company.findByIdAndUpdate(targetId, { verificationStatus: 'pending' });
        }
      }

      await AuditLog.create({
        adminId: req.user._id,
        action: 'auto_hidden',
        targetType,
        targetId,
        notes: `Auto-hidden after ${recentCount} reports`,
        metadata: { reportId: report._id, reportCount: recentCount },
      });

      return res.status(201).json({
        report,
        moderationCase,
        message: 'Report submitted and content moved to admin review.',
      });
    }

    res.status(201).json({ report, message: 'Report submitted. Thank you.' });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
};

exports.getReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, targetType } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (targetType) filter.targetType = targetType;

    const skip = (Number(page) - 1) * Number(limit);
    const [rawReports, total] = await Promise.all([
      Report.find(filter)
        .populate('reporterId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Report.countDocuments(filter),
    ]);

    const reports = await Promise.all(rawReports.map(normalizeReport));

    res.json({
      reports,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports.' });
  }
};

exports.getReportsByTarget = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const rawReports = await Report.find({ targetType, targetId })
      .populate('reporterId', 'fullName email')
      .sort({ createdAt: -1 });

    const reports = await Promise.all(rawReports.map(normalizeReport));

    res.json({ reports });
  } catch (error) {
    console.error('Get reports by target error:', error);
    res.status(500).json({ error: 'Failed to fetch reports for target.' });
  }
};

exports.updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'under_review', 'reviewed', 'action_taken', 'resolved', 'dismissed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    res.json({ report, message: 'Report status updated.' });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ error: 'Failed to update report status.' });
  }
};