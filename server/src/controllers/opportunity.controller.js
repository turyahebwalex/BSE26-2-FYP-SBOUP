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

// Match-score bands used by onOpportunityPublished. Strong matches get
// a 'match' notification (Apply CTA); partial matches with non-empty
// skill gaps get a 'learning' notification (Start a pathway CTA). Below
// PARTIAL_MIN the worker isn't a meaningful match and we stay silent
// to avoid notification fatigue.
const STRONG_MATCH_MIN = 60;
const PARTIAL_MATCH_MIN = 25;

/**
 * Fan out post-publish notifications when an opportunity transitions to
 * status='published'. Splits the worker base into three bands:
 *   - matchScore >= STRONG_MATCH_MIN  → 'match' notification
 *   - matchScore >= PARTIAL_MATCH_MIN → 'learning' notification with
 *     metadata.kind:'suggested' so the mobile renders a Start CTA, and
 *     metadata.opportunityId + missingSkills so LearningScreen can
 *     surface the right context.
 *   - below → no notification (signal-to-noise).
 *
 * Also fires the matching-engine's recompute hook so dashboard-fit,
 * /matching/recommendations, and Discover's match scores all reflect
 * the new opportunity on the next fetch — that's what populates the
 * 'Close Your Skill Gaps' rail for workers with relevant gaps.
 *
 * Runs sequentially per worker. For a ~6-worker demo this is ~6 score
 * calls (≈2-6s total) — acceptable for an admin action. If the dataset
 * grows we can switch to the matching engine's batch endpoints later.
 */
const onOpportunityPublished = async (opportunity) => {
  try {
    await mlService.triggerOpportunityMatch(opportunity._id);
  } catch (err) {
    logger.warn(`triggerOpportunityMatch failed: ${err.message}`);
  }

  const workers = await User.find({
    role: 'skilled_worker',
    accountStatus: 'active',
  })
    .select('_id')
    .lean();

  for (const w of workers) {
    try {
      const profile = await Profile.findOne({ userId: w._id }).select('_id').lean();
      if (!profile) continue;
      const scoreResult = await mlService.scoreMatch({
        profileId: profile._id,
        opportunityId: opportunity._id,
      });
      if (!scoreResult.ok) continue;
      const payload = scoreResult.data || {};
      const score = Math.round(
        payload.matchScore ?? payload.score ?? payload.data?.matchScore ?? 0
      );
      const missing = Array.isArray(payload.missingSkills)
        ? payload.missingSkills
        : Array.isArray(payload.data?.missingSkills)
          ? payload.data.missingSkills
          : [];

      if (score >= STRONG_MATCH_MIN) {
        await notify.create({
          userId: w._id,
          type: 'match',
          title: `New match — ${opportunity.title}`,
          content:
            `${opportunity.title} just went live and matches you at ${score}%. Tap View to open the role.`,
          metadata: {
            opportunityId: String(opportunity._id),
            opportunityTitle: opportunity.title,
            matchScore: score,
          },
        });
      } else if (score >= PARTIAL_MATCH_MIN && missing.length > 0) {
        const top = missing[0];
        const others = missing.length > 1 ? `, ${missing.slice(1, 3).join(', ')}` : '';
        await notify.create({
          userId: w._id,
          type: 'learning',
          title: `Bridge a gap for ${opportunity.title}`,
          content:
            `${opportunity.title} just went live (${score}% match). Bridge ${top}${others} to lift your fit. Tap Start to generate a pathway.`,
          metadata: {
            // kind:'suggested' triggers the Start CTA in the mobile
            // notification list. opportunityId lets the worker land on
            // the role after they complete the pathway.
            kind: 'suggested',
            opportunityId: String(opportunity._id),
            opportunityTitle: opportunity.title,
            targetSkill: top,
            missingSkills: missing,
            matchScore: score,
          },
        });
      }
    } catch (err) {
      logger.warn(`publish fan-out for worker ${w._id} failed: ${err.message}`);
    }
  }
};

exports.onOpportunityPublished = onOpportunityPublished;

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
      companyId,
    } = req.query;

    const filter = { status: 'published', deadline: { $gte: new Date() } };

    if (companyId) {
      filter.companyId = companyId;
    }

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
    // Get the employer's companyId from their user document
    const user = await User.findById(req.user._id).select('companyId');
    if (!user.companyId) {
      return res.status(400).json({ error: 'No company associated with your account.' });
    }

    // Find opportunities belonging to that company
    const opportunities = await Opportunity.find({ companyId: user.companyId })
      .populate('requiredSkills', 'skillName category')
      .populate('companyId', 'name logoUrl')
      .populate('postedByUserId', 'fullName email') // optional
      .sort({ createdAt: -1 });

    // (Keep the aggregation for match scores and applicant counts as is)
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

// ============================================================================
// NEW APPLICATION METHODS
// ============================================================================

/**
 * GET /api/opportunities/:opportunityId/apply-options
 * Returns available application methods for an opportunity
 * Also checks if the user has already applied
 */
exports.getApplicationOptions = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    
    const opportunity = await Opportunity.findById(opportunityId)
      .select('applicationMethods externalApplyUrl messageInstructions title companyId postedByUserId');
    
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    // Check if user has already applied
    const profile = await Profile.findOne({ userId: req.user._id }).select('_id');
    let hasApplied = false;
    let applicationId = null;
    
    if (profile) {
      const existingApplication = await Application.findOne({
        profileId: profile._id,
        opportunityId: opportunityId
      }).select('_id applicationSource');
      
      if (existingApplication) {
        hasApplied = true;
        applicationId = existingApplication._id;
      }
    }
    
    // Get available methods with metadata
    const availableMethods = [];
    
    if (opportunity.applicationMethods && opportunity.applicationMethods.includes('in_app')) {
      availableMethods.push({
        type: 'in_app',
        label: 'In-App Application',
        description: 'Submit your CV, cover letter, and supporting documents directly',
        icon: 'document-text-outline',
        color: '#F59E0B',
      });
    }
    
    if (opportunity.applicationMethods && opportunity.applicationMethods.includes('message')) {
      availableMethods.push({
        type: 'message',
        label: 'Apply via Message',
        description: opportunity.messageInstructions || 'Send a direct message to the employer expressing your interest',
        icon: 'chatbubble-outline',
        color: '#3B82F6',
        instructions: opportunity.messageInstructions,
      });
    }
    
    if (opportunity.applicationMethods && opportunity.applicationMethods.includes('external_link') && opportunity.externalApplyUrl) {
      availableMethods.push({
        type: 'external_link',
        label: 'External Application',
        description: 'Apply through an external form',
        icon: 'link-outline',
        color: '#10B981',
        url: opportunity.externalApplyUrl,
      });
    }
    
    res.json({
      success: true,
      opportunity: {
        id: opportunity._id,
        title: opportunity.title,
        companyId: opportunity.companyId,
        employerId: opportunity.postedByUserId,
      },
      availableMethods,
      hasApplied,
      applicationId,
    });
  } catch (error) {
    logger.error('Get application options error:', error);
    res.status(500).json({ error: 'Failed to get application options.' });
  }
};

/**
 * POST /api/opportunities/apply-by-message
 * Handle message-based application
 */
exports.applyViaMessage = async (req, res) => {
  try {
    const { opportunityId, message, conversationId } = req.body;
    
    if (!opportunityId) {
      return res.status(400).json({ error: 'Opportunity ID is required' });
    }
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get opportunity to verify it exists and message method is allowed
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    if (!opportunity.applicationMethods || !opportunity.applicationMethods.includes('message')) {
      return res.status(400).json({ error: 'Message applications are not accepted for this opportunity' });
    }
    
    // Get user's profile
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(400).json({ error: 'Please complete your profile before applying' });
    }
    
    // Check if already applied
    const existingApplication = await Application.findOne({
      profileId: profile._id,
      opportunityId: opportunityId,
    });
    
    if (existingApplication) {
      return res.status(400).json({ error: 'You have already applied to this opportunity' });
    }
    
    // Create application
    const application = new Application({
      profileId: profile._id,
      opportunityId: opportunityId,
      applicationSource: 'message',
      sourceConversationId: conversationId || null,
      notes: message.trim(),
      status: 'submitted',
      submittedAt: new Date(),
    });
    
    await application.save();
    
    // Increment application count on opportunity
    await Opportunity.findByIdAndUpdate(opportunityId, {
      $inc: { applicationCount: 1 }
    });
    
    // Send notification to employer via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${opportunity.postedByUserId}`).emit('new_application', {
        applicationId: application._id,
        opportunityId: opportunityId,
        opportunityTitle: opportunity.title,
        applicantName: req.user.fullName,
        applicantId: req.user._id,
        type: 'message_application',
        message: message.trim(),
      });
    }
    
    // Also create a notification in the database
    await notify.create({
      userId: opportunity.postedByUserId,
      type: 'application_update',
      title: `New message application for ${opportunity.title}`,
      content: `${req.user.fullName} has applied via message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`,
      metadata: {
        applicationId: application._id,
        opportunityId: opportunityId,
        applicantId: req.user._id,
        applicantName: req.user.fullName,
      },
    });
    
    res.json({
      success: true,
      message: 'Your application has been sent to the employer',
      application: {
        id: application._id,
        status: application.status,
        submittedAt: application.submittedAt,
      },
    });
  } catch (error) {
    logger.error('Apply via message error:', error);
    res.status(500).json({ error: 'Failed to submit application.' });
  }
};

/**
 * GET /api/opportunities/:opportunityId/external-url
 * Get external application URL for redirect
 */
exports.getExternalApplyUrl = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    
    const opportunity = await Opportunity.findById(opportunityId)
      .select('externalApplyUrl applicationMethods title');
    
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    if (!opportunity.applicationMethods || !opportunity.applicationMethods.includes('external_link')) {
      return res.status(400).json({ error: 'External applications are not accepted for this opportunity' });
    }
    
    if (!opportunity.externalApplyUrl) {
      return res.status(404).json({ error: 'External application URL not configured' });
    }
    
    // Track click for analytics
    await Opportunity.findByIdAndUpdate(opportunityId, {
      $inc: { externalClickCount: 1 }
    });
    
    // Optional: Create a tracking record for this user's external click
    // This can help with analytics even though application is external
    try {
      const profile = await Profile.findOne({ userId: req.user._id }).select('_id');
      if (profile) {
        // You could create a tracking document here if needed
        logger.info(`User ${req.user._id} clicked external link for opportunity ${opportunityId}`);
      }
    } catch (trackErr) {
      // Don't fail if tracking fails
      logger.warn('Failed to track external click:', trackErr.message);
    }
    
    res.json({
      success: true,
      url: opportunity.externalApplyUrl,
      opportunityTitle: opportunity.title,
    });
  } catch (error) {
    logger.error('Get external URL error:', error);
    res.status(500).json({ error: 'Failed to get external application URL.' });
  }
};

/**
 * GET /api/opportunities/:opportunityId/application-form
 * Get custom questions for in-app application
 */
exports.getApplicationForm = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    
    const opportunity = await Opportunity.findById(opportunityId)
      .select('title requiredDocuments customQuestions applicationMethods companyId');
    
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    if (!opportunity.applicationMethods || !opportunity.applicationMethods.includes('in_app')) {
      return res.status(400).json({ error: 'In-app applications are not accepted for this opportunity' });
    }
    
    // Get user's profile to check if they have existing data to pre-fill
    const profile = await Profile.findOne({ userId: req.user._id })
      .populate('skills')
      .select('title bio location');
    
    res.json({
      success: true,
      opportunity: {
        id: opportunity._id,
        title: opportunity.title,
        companyId: opportunity.companyId,
      },
      requiredDocuments: opportunity.requiredDocuments || ['cv', 'cover_letter'],
      customQuestions: opportunity.customQuestions || [],
      prefillData: profile ? {
        title: profile.title,
        location: profile.location,
        bio: profile.bio,
      } : null,
    });
  } catch (error) {
    logger.error('Get application form error:', error);
    res.status(500).json({ error: 'Failed to get application form.' });
  }
};

/**
 * GET /api/opportunities/:opportunityId/check-application
 * Check if user has already applied to an opportunity
 */
exports.checkApplicationStatus = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    
    const profile = await Profile.findOne({ userId: req.user._id }).select('_id');
    
    if (!profile) {
      return res.json({ hasApplied: false, application: null });
    }
    
    const application = await Application.findOne({
      profileId: profile._id,
      opportunityId: opportunityId,
    }).select('_id status applicationSource submittedAt');
    
    res.json({
      hasApplied: !!application,
      application: application || null,
    });
  } catch (error) {
    logger.error('Check application status error:', error);
    res.status(500).json({ error: 'Failed to check application status.' });
  }
};