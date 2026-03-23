const axios = require('axios');
const logger = require('../utils/logger');

// ─── Matching Controller ───
exports.getRecommendations = async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.MATCHING_SERVICE_URL}/api/match/recommendations/${req.user._id}`
    );
    res.json(response.data);
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
