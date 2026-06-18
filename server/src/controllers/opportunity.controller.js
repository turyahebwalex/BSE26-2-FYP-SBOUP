const Opportunity = require('../models/Opportunity');
const User = require('../models/User');
const Company = require('../models/Company');
const Profile = require('../models/Profile');
const Application = require('../models/Application');
const FraudLog = require('../models/FraudLog');
const mlService = require('../services/ml.service');
const notify = require('../services/notification.service');
const attachModerationExplanation = require('../utils/attachModerationExplanation');
const logger = require('../utils/logger');

const FRAUD_LOW = parseInt(process.env.FRAUD_LOW_THRESHOLD, 10) || 30;
const FRAUD_HIGH = parseInt(process.env.FRAUD_HIGH_THRESHOLD, 10) || 70;
const FRAUD_THRESHOLDS = { low: FRAUD_LOW, high: FRAUD_HIGH };

const buildFraudSignals = (features = {}) => {
  const signals = [];
  const patternCount = Number(features.fraud_pattern_count || 0);
  const wordCount = Number(features.word_count || 0);
  const exclamationCount = Number(features.exclamation_count || 0);
  const uppercaseRatio = Number(features.uppercase_ratio || 0);
  const urlCount = Number(features.url_count || 0);

  if (patternCount > 0) {
    signals.push({
      signal: `${patternCount} fraud indicator pattern${patternCount === 1 ? '' : 's'} matched`,
      weight: patternCount * 20,
    });
  }
  if (Number(features.has_unrealistic_pay || 0)) {
    signals.push({ signal: 'Compensation exceeds the realistic pay threshold', weight: 25 });
  }
  if (wordCount > 0 && wordCount < 10) {
    signals.push({ signal: 'Posting description is unusually short', weight: 15 });
  }
  if (exclamationCount > 5) {
    signals.push({ signal: 'Excessive exclamation marks', weight: 10 });
  }
  if (uppercaseRatio > 0.3) {
    signals.push({ signal: 'Excessive uppercase text', weight: 10 });
  }
  if (urlCount > 3) {
    signals.push({ signal: 'Suspicious number of external URLs', weight: 10 });
  }

  return signals;
};

const buildFraudExplanation = ({ classification, fraudScore, decisionReason, signals }) => {
  const explanationParts = [];
  if (decisionReason) {
    explanationParts.push(decisionReason);
  }
  if (Array.isArray(signals) && signals.length > 0) {
    explanationParts.push(`Key signals: ${signals.map((item) => item.signal).join('; ')}`);
  }
  if (typeof fraudScore === 'number') {
    explanationParts.push(`Fraud score ${fraudScore}.`);
  }
  if (classification) {
    explanationParts.push(`Classification: ${classification}.`);
  }
  return explanationParts.join(' ');
};

const applyFraudXaiFromService = (opportunity, fraudData) => {
  const xai = fraudData && fraudData.xaiExplanation;
  if (!xai || typeof xai !== 'object') return;
  opportunity.fraudXai = {
    plainEnglishRationale: xai.plain_english_rationale || '',
    confidenceLevel: xai.confidence_level || '',
    qualityMetrics: xai.quality_metrics || null,
    riskFactors: Array.isArray(xai.risk_factors) ? xai.risk_factors : [],
    detailedExplanation: xai.detailed_explanation || '',
    updatedAt: new Date(),
  };
  const qs = xai.quality_metrics?.overall_score;
  if (typeof qs === 'number' && Number.isFinite(qs)) {
    opportunity.qualityScore = Math.round(qs);
  }
};

const evaluateFraudDecision = ({ fraudScore, fraudAvailable, isAppealable = false }) => {
  if (!fraudAvailable) {
    return {
      status: 'under_review',
      classification: 'Unknown',
      decisionOutcome: 'under_review',
      decisionReason: 'Fraud service unavailable; posting sent for manual review.',
    };
  }

  if (fraudScore < FRAUD_LOW) {
    return {
      status: 'published',
      classification: 'Low Risk',
      decisionOutcome: 'published',
      decisionReason: `Fraud score ${fraudScore} is below the auto-approval threshold (${FRAUD_LOW}).`,
    };
  }

  if (fraudScore >= FRAUD_HIGH) {
    // Permanent block for clear fraud (score >= 70)
    return {
      status: 'blocked',
      classification: 'High Risk',
      decisionOutcome: 'blocked',
      decisionReason: `Fraud score ${fraudScore} indicates clear fraudulent content (>= ${FRAUD_HIGH}). Posting permanently blocked.`,
    };
  }

  // For borderline cases (30-69), keep them in the manual review queue.
  // Admin can optionally move borderline cases to `suspended` via the moderation UI.

  return {
    status: 'under_review',
    classification: 'Medium Risk',
    decisionOutcome: 'under_review',
    decisionReason: `Fraud score ${fraudScore} falls within the manual review band (${FRAUD_LOW}-${FRAUD_HIGH - 1}).`,
  };
};

const logFraudEvent = async (payload) => {
  try {
    await FraudLog.create(payload);
  } catch (error) {
    logger.warn(`Fraud log write failed: ${error.message}`);
  }
};

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
    let fraudScore = 0;
    let fraudSignals = [];
    let fraudFeatures = {};
    let fraudClassification = 'Unknown';
    let fraudDecision = evaluateFraudDecision({ fraudAvailable: false });

    if (fraudResult.ok) {
      fraudScore = Number(fraudResult.data.fraudScore) || 0;
      fraudFeatures = fraudResult.data.features || {};
      fraudSignals = Array.isArray(fraudResult.data.signals) && fraudResult.data.signals.length > 0
        ? fraudResult.data.signals
        : buildFraudSignals(fraudFeatures);
      fraudClassification = fraudResult.data.classification || evaluateFraudDecision({ fraudScore, fraudAvailable: true, isAppealable: true }).classification;
      fraudDecision = evaluateFraudDecision({ fraudScore, fraudAvailable: true, isAppealable: true });

      opportunity.fraudRiskScore = fraudScore;
      opportunity.fraudSignals = fraudSignals;
      opportunity.status = fraudDecision.status;
      applyFraudXaiFromService(opportunity, fraudResult.data);
    } else {
      opportunity.fraudRiskScore = 0;
      opportunity.fraudSignals = [];
      opportunity.status = 'under_review';
    }

    await opportunity.save();

    await logFraudEvent({
      opportunityId: opportunity._id,
      source: 'workflow',
      stage: 'create',
      fraudScore,
      classification: fraudClassification,
      decisionOutcome: opportunity.status,
      decisionReason: fraudDecision.decisionReason,
      thresholds: FRAUD_THRESHOLDS,
      features: fraudFeatures,
      signals: fraudSignals,
      explanation: buildFraudExplanation({
        classification: fraudClassification,
        fraudScore,
        decisionReason: fraudDecision.decisionReason,
        signals: fraudSignals,
      }),
    });

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
    const shouldAttachModerationExplanation = req.user?.role === 'admin' || req.user?.role === 'employer';
    const responseOpportunity = shouldAttachModerationExplanation
      ? (await attachModerationExplanation([opportunity]))[0]
      : opportunity;
    res.json({ opportunity: responseOpportunity });
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

    if (fraudFieldsChanged) {
      const fraudResult = await mlService.detectFraud(opportunity);
      let fraudScore = opportunity.fraudRiskScore || 0;
      let fraudSignals = opportunity.fraudSignals || [];
      let fraudFeatures = {};
      let fraudClassification = 'Unknown';
      let fraudDecision = evaluateFraudDecision({ fraudAvailable: false });

      if (fraudResult.ok) {
        fraudScore = Number(fraudResult.data.fraudScore) || 0;
        fraudFeatures = fraudResult.data.features || {};
        fraudSignals = Array.isArray(fraudResult.data.signals) && fraudResult.data.signals.length > 0
          ? fraudResult.data.signals
          : buildFraudSignals(fraudFeatures);
        fraudClassification = fraudResult.data.classification || evaluateFraudDecision({ fraudScore, fraudAvailable: true, isAppealable: true }).classification;
        fraudDecision = evaluateFraudDecision({ fraudScore, fraudAvailable: true, isAppealable: true });

        opportunity.fraudRiskScore = fraudScore;
        opportunity.fraudSignals = fraudSignals;
        opportunity.status = fraudDecision.status;
        applyFraudXaiFromService(opportunity, fraudResult.data);
      } else {
        opportunity.status = 'under_review';
      }

      await logFraudEvent({
        opportunityId: opportunity._id,
        source: 'workflow',
        stage: 'update',
        fraudScore,
        classification: fraudClassification,
        decisionOutcome: opportunity.status,
        decisionReason: fraudDecision.decisionReason,
        thresholds: FRAUD_THRESHOLDS,
        features: fraudFeatures,
        signals: fraudSignals,
        explanation: buildFraudExplanation({
          classification: fraudClassification,
          fraudScore,
          decisionReason: fraudDecision.decisionReason,
          signals: fraudSignals,
        }),
      });
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

exports.submitAppeal = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Appeal reason is required.' });
    }

    const opportunity = await Opportunity.findOne({
      _id: req.params.id,
      postedByUserId: req.user._id,
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    if (!['blocked', 'suspended', 'under_review'].includes(opportunity.status)) {
      return res.status(400).json({ 
        error: 'Appeal can only be submitted for blocked, suspended, or under review opportunities.' 
      });
    }

    // Initialize appeal object for older opportunities where it might be undefined
    if (!opportunity.appeal) {
      opportunity.appeal = { status: 'none' };
    }

    if (opportunity.appeal.status !== 'none') {
      return res.status(400).json({ 
        error: 'An appeal has already been submitted for this opportunity.' 
      });
    }

    // Update appeal fields
    opportunity.appeal.status = 'pending';
    opportunity.appeal.reason = reason.trim();
    opportunity.appeal.submittedAt = new Date();
    
    await opportunity.save();

    // Notify admins about new appeal
    const admins = await User.find({ role: 'admin', accountStatus: 'active' }).select('_id');
    await Promise.all(
      admins.map((admin) =>
        notify.create({
          userId: admin._id,
          type: 'appeal_submitted',
          content: `New appeal submitted for "${opportunity.title}" - ${opportunity.fraudRiskScore} risk score.`,
          metadata: { 
            opportunityId: opportunity._id, 
            fraudRiskScore: opportunity.fraudRiskScore,
            appealReason: reason.trim()
          },
        })
      )
    );

    res.json({ 
      message: 'Appeal submitted successfully. It will be reviewed by an administrator.',
      appeal: opportunity.appeal
    });
  } catch (error) {
    logger.error('Submit appeal error:', error);
    res.status(500).json({ error: 'Failed to submit appeal.' });
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

    const opportunitiesWithExplanation = await attachModerationExplanation(enriched);

    res.json({ opportunities: opportunitiesWithExplanation });
  } catch (error) {
    logger.error('Get my opportunities error:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities.' });
  }
};
