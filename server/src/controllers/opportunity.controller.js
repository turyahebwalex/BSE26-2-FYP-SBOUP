const Opportunity = require('../models/Opportunity');
const User = require('../models/User');
const Company = require('../models/Company');
const Profile = require('../models/Profile');
const Application = require('../models/Application');
const mlService = require('../services/ml.service');
const notify = require('../services/notification.service');
const logger = require('../utils/logger');

const FRAUD_LOW = parseInt(process.env.FRAUD_LOW_THRESHOLD, 10) || 30;
const FRAUD_HIGH = parseInt(process.env.FRAUD_HIGH_THRESHOLD, 10) || 70;

/**
 * POST /api/opportunities
 * Create + run fraud screen (30/70 risk gate) + notify matching engine.
 */
exports.createOpportunity = async (req, res) => {
  try {
    // Inherit companyId from posting employer if not provided
    let companyId = req.body.companyId || null;
    if (!companyId && req.user.companyId) companyId = req.user.companyId;

    const opportunity = await Opportunity.create({
      ...req.body,
      companyId,
      postedByUserId: req.user._id,
      status: 'draft',
    });

    const fraudResult = await mlService.detectFraud(opportunity);
    if (fraudResult.ok) {
      const { fraudScore, signals } = fraudResult.data;
      opportunity.fraudRiskScore = fraudScore || 0;
      opportunity.fraudSignals = signals || [];
    }

    // Every newly-posted opportunity must be admin-approved before going live.
    // Only outright block postings whose fraud score crosses the high threshold.
    if (opportunity.fraudRiskScore >= FRAUD_HIGH) {
      opportunity.status = 'blocked';
    } else {
      opportunity.status = 'under_review';
    }
    await opportunity.save();

    if (opportunity.status === 'under_review') {
      const admins = await User.find({ role: 'admin', accountStatus: 'active' }).select('_id');
      await Promise.all(
        admins.map((admin) =>
          notify.create({
            userId: admin._id,
            type: 'fraud_alert',
            content: `New opportunity "${opportunity.title}" awaits review (risk ${opportunity.fraudRiskScore}).`,
            metadata: { opportunityId: opportunity._id, fraudRiskScore: opportunity.fraudRiskScore },
          })
        )
      );
    }

    res.status(201).json({ opportunity });
  } catch (error) {
    logger.error('Create opportunity error:', error);
    res.status(500).json({ error: 'Failed to create opportunity.' });
  }
};

/**
 * GET /api/opportunities  (public discovery feed)
 */
exports.getOpportunities = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      location,
      search,
      experienceLevel,
      isRemote,
      minPay,
      maxPay,
      sortBy = 'createdAt',
    } = req.query;

    const filter = { status: 'published', deadline: { $gte: new Date() } };
    if (category) filter.category = category;
    if (location) filter.location = { $regex: location, $options: 'i' };
    if (experienceLevel) filter.experienceLevel = experienceLevel;
    if (isRemote) filter.isRemote = isRemote === 'true';
    if (search) filter.$text = { $search: search };
    if (minPay) filter['compensationRange.min'] = { $gte: Number(minPay) };
    if (maxPay) filter['compensationRange.max'] = { $lte: Number(maxPay) };

    const skip = (Number(page) - 1) * Number(limit);
    const [opportunitiesRaw, total] = await Promise.all([
      Opportunity.find(filter)
        .populate('requiredSkills', 'skillName category')
        .populate('postedByUserId', 'fullName email')
        .populate('companyId', 'name logoUrl verificationStatus')
        .sort({ [sortBy]: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Opportunity.countDocuments(filter),
    ]);

    // For skilled workers, attach a real per-opportunity match score so every
    // card the worker sees can render an accurate percentage (0% included).
    let opportunities = opportunitiesRaw.map((o) => o.toObject());
    if (req.user?.role === 'skilled_worker') {
      const profile = await Profile.findOne({ userId: req.user._id }).select('_id');
      if (profile) {
        const scoreMap = await mlService.batchScore(profile._id, opportunities.map((o) => o._id));
        opportunities = opportunities.map((o) => ({
          ...o,
          matchScore: scoreMap.get(String(o._id)) ?? 0,
        }));
      } else {
        opportunities = opportunities.map((o) => ({ ...o, matchScore: 0 }));
      }
    }

    res.json({
      opportunities,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error('Get opportunities error:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities.' });
  }
};

exports.getOpportunityById = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate('requiredSkills', 'skillName category')
      .populate('postedByUserId', 'fullName email')
      .populate('companyId', 'name logoUrl verificationStatus website description');

    if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });

    opportunity.viewCount += 1;
    await opportunity.save();
    res.json({ opportunity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch opportunity.' });
  }
};

exports.updateOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findOne({
      _id: req.params.id,
      postedByUserId: req.user._id,
    });
    if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });

    // Block editing after publication of fraud-critical fields
    const { title, description, compensationRange } = req.body;
    const fraudFieldsChanged =
      (title && title !== opportunity.title) ||
      (description && description !== opportunity.description) ||
      (compensationRange && JSON.stringify(compensationRange) !== JSON.stringify(opportunity.compensationRange));

    Object.assign(opportunity, req.body);

    if (fraudFieldsChanged && opportunity.status === 'published') {
      const fraudResult = await mlService.detectFraud(opportunity);
      if (fraudResult.ok) {
        opportunity.fraudRiskScore = fraudResult.data.fraudScore || 0;
        opportunity.fraudSignals = fraudResult.data.signals || [];
        if (opportunity.fraudRiskScore >= FRAUD_HIGH) opportunity.status = 'blocked';
        else if (opportunity.fraudRiskScore >= FRAUD_LOW) opportunity.status = 'under_review';
      }
    }
    await opportunity.save();
    res.json({ opportunity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update opportunity.' });
  }
};

exports.archiveOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findOneAndUpdate(
      { _id: req.params.id, postedByUserId: req.user._id },
      { status: 'archived' },
      { new: true }
    );
    if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });
    res.json({ message: 'Opportunity archived.', opportunity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive opportunity.' });
  }
};

exports.getMyOpportunities = async (req, res) => {
  try {
    const opportunities = await Opportunity.find({ postedByUserId: req.user._id })
      .populate('requiredSkills', 'skillName category')
      .populate('companyId', 'name logoUrl')
      .sort({ createdAt: -1 });

    // Enrich each posting with applicant match-score aggregates so the
    // "My Opportunities" page can show real matching percentages.
    const ids = opportunities.map((o) => o._id);
    const aggregates = ids.length
      ? await Application.aggregate([
          { $match: { opportunityId: { $in: ids } } },
          {
            $group: {
              _id: '$opportunityId',
              avgMatchScore: { $avg: '$matchScore' },
              bestMatchScore: { $max: '$matchScore' },
              applicantCount: { $sum: 1 },
            },
          },
        ])
      : [];
    const aggMap = new Map(aggregates.map((a) => [String(a._id), a]));

    const enriched = opportunities.map((opp) => {
      const agg = aggMap.get(String(opp._id));
      return {
        ...opp.toObject(),
        avgMatchScore: agg ? Math.round(agg.avgMatchScore || 0) : null,
        bestMatchScore: agg ? Math.round(agg.bestMatchScore || 0) : null,
        applicantCount: agg ? agg.applicantCount : 0,
      };
    });

    res.json({ opportunities: enriched });
  } catch (error) {
    logger.error('Get my opportunities error:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities.' });
  }
};
