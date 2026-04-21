const Report = require('../models/Report');
const Opportunity = require('../models/Opportunity');

exports.createReport = async (req, res) => {
  try {
    const report = await Report.create({ reporterId: req.user._id, ...req.body });

    // Auto-moderation: 3+ reports in 48 hours
    const recentCount = await Report.countDocuments({
      targetId: req.body.targetId,
      targetType: req.body.targetType,
      createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });

    if (recentCount >= 3 && req.body.targetType === 'opportunity') {
      await Opportunity.findByIdAndUpdate(req.body.targetId, { status: 'under_review' });
    }

    res.status(201).json({ report, message: 'Report submitted. Thank you.' });
  } catch (error) {
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
    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('reporterId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Report.countDocuments(filter),
    ]);

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
    res.status(500).json({ error: 'Failed to fetch reports.' });
  }
};

exports.getReportsByTarget = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const reports = await Report.find({ targetType, targetId })
      .populate('reporterId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json({ reports });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports for target.' });
  }
};

exports.updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['reviewed', 'resolved'];
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
    res.status(500).json({ error: 'Failed to update report status.' });
  }
};
