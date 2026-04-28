const axios = require('axios');
const Opportunity = require('../models/Opportunity');
const logger = require('../utils/logger');

// ─── Matching Controller ───
exports.getRecommendations = async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.MATCHING_SERVICE_URL}/api/match/recommendations/${req.user._id}`
    );
    const raw = Array.isArray(response.data?.recommendations) ? response.data.recommendations : [];

    // Enrich with display fields so cards can render company name, type, location, etc.
    const ids = raw.map((r) => r.opportunityId).filter(Boolean);
    const opps = ids.length
      ? await Opportunity.find({ _id: { $in: ids }, status: 'published' })
          .populate('companyId', 'name logoUrl verificationStatus')
          .populate('postedByUserId', 'fullName email')
          .populate('requiredSkills', 'skillName category')
      : [];
    const oppMap = new Map(opps.map((o) => [String(o._id), o.toObject()]));

    const recommendations = raw
      .map((r) => {
        const opp = oppMap.get(String(r.opportunityId));
        if (!opp) return null;
        return {
          ...opp,
          opportunityId: r.opportunityId,
          matchScore: typeof r.matchScore === 'number' ? r.matchScore : 0,
          missingSkills: r.missingSkills || [],
        };
      })
      .filter(Boolean);

    res.json({ recommendations });
  } catch (error) {
    logger.warn('Matching service unavailable:', error.message);
    res.status(503).json({ error: 'Matching service unavailable.' });
  }
};

exports.getMatchScore = async (req, res) => {
  try {
    const { profileId, opportunityId } = req.query;
    const response = await axios.post(
      `${process.env.MATCHING_SERVICE_URL}/api/match/score`,
      { profileId, opportunityId }
    );
    res.json(response.data);
  } catch (error) {
    res.status(503).json({ error: 'Matching service unavailable.' });
  }
};
