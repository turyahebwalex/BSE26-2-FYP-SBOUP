const axios = require('axios');
const Opportunity = require('../models/Opportunity');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * POST /api/opportunities
 * Create a new opportunity (employers only)
 */
exports.createOpportunity = async (req, res) => {
  try {
    const opportunityData = {
      ...req.body,
      employerId: req.user._id,
      status: 'draft',
    };

    const opportunity = await Opportunity.create(opportunityData);

    // Forward to Fraud Detection Microservice
    try {
      const fraudResponse = await axios.post(
        `${process.env.FRAUD_DETECTION_SERVICE_URL}/api/detect`,
        {
          opportunityId: opportunity._id.toString(),
          title: opportunity.title,
          description: opportunity.description,
          employerId: opportunity.employerId.toString(),
          compensationRange: opportunity.compensationRange,
        }
      );

      const { fraudScore, classification } = fraudResponse.data;
      opportunity.fraudRiskScore = fraudScore;

      if (fraudScore < 30) {
        opportunity.status = 'published';
      } else if (fraudScore >= 70) {
        opportunity.status = 'blocked';
      } else {
        opportunity.status = 'under_review';
      }
      await opportunity.save();

      // If published, trigger matching engine
      if (opportunity.status === 'published') {
        try {
          await axios.post(
            `${process.env.MATCHING_SERVICE_URL}/api/match/opportunity`,
            { opportunityId: opportunity._id.toString() }
          );
        } catch (matchErr) {
          logger.warn('Matching service unavailable:', matchErr.message);
        }
      }
    } catch (fraudErr) {
      logger.warn('Fraud detection service unavailable:', fraudErr.message);
      opportunity.status = 'under_review';
      await opportunity.save();
    }

    res.status(201).json({ opportunity });
  } catch (error) {
    logger.error('Create opportunity error:', error);
    res.status(500).json({ error: 'Failed to create opportunity.' });
  }
};

/**
 * GET /api/opportunities
 * Search and filter opportunities with pagination
 */
exports.getOpportunities = async (req, res) => {
  try {
    const {
      page = 1, limit = 20, category, location, search,
      experienceLevel, isRemote, minPay, maxPay, sortBy = 'createdAt',
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
    const [opportunities, total] = await Promise.all([
      Opportunity.find(filter)
        .populate('requiredSkills', 'skillName category')
        .populate('employerId', 'fullName email')
        .sort({ [sortBy]: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Opportunity.countDocuments(filter),
    ]);

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

/**
 * GET /api/opportunities/:id
 */
exports.getOpportunityById = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate('requiredSkills', 'skillName category')
      .populate('employerId', 'fullName email');

    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    // Increment view count
    opportunity.viewCount += 1;
    await opportunity.save();

    res.json({ opportunity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch opportunity.' });
  }
};

/**
 * PUT /api/opportunities/:id
 */
exports.updateOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findOne({
      _id: req.params.id,
      employerId: req.user._id,
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    Object.assign(opportunity, req.body);
    await opportunity.save();

    res.json({ opportunity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update opportunity.' });
  }
};

/**
 * DELETE /api/opportunities/:id (soft delete - archive)
 */
exports.archiveOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findOneAndUpdate(
      { _id: req.params.id, employerId: req.user._id },
      { status: 'archived' },
      { new: true }
    );

    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    res.json({ message: 'Opportunity archived.', opportunity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive opportunity.' });
  }
};

/**
 * GET /api/opportunities/employer/mine
 * Get employer's own opportunities
 */
exports.getMyOpportunities = async (req, res) => {
  try {
    const opportunities = await Opportunity.find({ employerId: req.user._id })
      .populate('requiredSkills', 'skillName category')
      .sort({ createdAt: -1 });

    res.json({ opportunities });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch opportunities.' });
  }
};
