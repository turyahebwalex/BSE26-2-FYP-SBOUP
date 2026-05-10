const axios = require('axios');
const Opportunity = require('../models/Opportunity');
const Profile = require('../models/Profile');            // ← added
const Application = require('../models/Application');    // ← added
const Notification = require('../models/Notification');  // ← added for duplicate check
const notify = require('../services/notification.service'); // ← already used elsewhere
const logger = require('../utils/logger');

const MATCH_THRESHOLD = 75;   // minimum match score to send a notification
const NOTIFICATION_COOLDOWN_DAYS = 7;

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

    // ─── Create notifications for high‑score matches ─────────────────────────
    // We run this asynchronously so it doesn't block the response.
    setImmediate(async () => {
      try {
        const userProfile = await Profile.findOne({ userId: req.user._id });
        if (!userProfile) return;

        // Check which opportunities the user already applied to
        const appliedOppIds = await Application.distinct('opportunityId', {
          profileId: userProfile._id,
        });

        // Consider only recommendations above threshold
        const highMatches = recommendations.filter(
          (r) => r.matchScore >= MATCH_THRESHOLD && !appliedOppIds.includes(r.opportunityId)
        );

        // Limit to 3 new ones to avoid spam
        const toNotify = highMatches.slice(0, 3);

        for (const rec of toNotify) {
          // Check if a notification for this user + opportunity already exists (recent)
          const existing = await Notification.findOne({
            userId: req.user._id,
            type: 'match',
            'metadata.opportunityId': rec.opportunityId,
            createdAt: { $gte: new Date(Date.now() - NOTIFICATION_COOLDOWN_DAYS * 86400000) },
          });
          if (!existing) {
            await notify.create({
              userId: req.user._id,
              type: 'match',
              title: 'New Match!',
              content: `We found a new opportunity that matches your skills: ${rec.title} (${Math.round(rec.matchScore)}% match).`,
              metadata: {
                opportunityId: rec.opportunityId,
                matchScore: rec.matchScore,
              },
            });
            logger.info(`Match notification sent for user ${req.user._id} opp ${rec.opportunityId}`);
          }
        }
      } catch (notifyErr) {
        logger.warn('Failed to send match notifications:', notifyErr);
      }
    });

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