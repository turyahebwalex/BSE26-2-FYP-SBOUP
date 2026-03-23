const axios = require('axios');
const logger = require('../utils/logger');

exports.sendQuery = async (req, res) => {
  try {
    const { query, sessionId } = req.body;
    const response = await axios.post(
      `${process.env.CHATBOT_SERVICE_URL}/api/chatbot/query`,
      { query, userId: req.user._id.toString(), sessionId }
    );
    res.json(response.data);
  } catch (error) {
    logger.warn('Chatbot service unavailable:', error.message);
    res.status(503).json({
      response: "I'm having trouble connecting right now. Please try again shortly or submit a support ticket.",
      fallback: true,
    });
  }
};
