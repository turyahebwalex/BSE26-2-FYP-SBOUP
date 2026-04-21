const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Thin wrapper around the four Python AI microservices. Every call
 * is wrapped in a try/catch so an outage of an ML service never
 * crashes the API gateway — callers receive a fallback value instead.
 */

const TIMEOUT_MS = 15_000;

const tryPost = async (url, body) => {
  try {
    const { data } = await axios.post(url, body, { timeout: TIMEOUT_MS });
    return { ok: true, data };
  } catch (err) {
    logger.warn(`ML call failed ${url}: ${err.message}`);
    return { ok: false, error: err.message };
  }
};

const tryGet = async (url) => {
  try {
    const { data } = await axios.get(url, { timeout: TIMEOUT_MS });
    return { ok: true, data };
  } catch (err) {
    logger.warn(`ML call failed ${url}: ${err.message}`);
    return { ok: false, error: err.message };
  }
};

// ─── Matching Engine ─────────────────────────────────────────────
const scoreMatch = ({ profileId, opportunityId }) =>
  tryPost(`${process.env.MATCHING_SERVICE_URL}/api/match/score`, {
    profileId: String(profileId),
    opportunityId: String(opportunityId),
  });

const getRecommendations = (userId) =>
  tryGet(`${process.env.MATCHING_SERVICE_URL}/api/match/recommendations/${userId}`);

const triggerOpportunityMatch = (opportunityId) =>
  tryPost(`${process.env.MATCHING_SERVICE_URL}/api/match/opportunity`, {
    opportunityId: String(opportunityId),
  });

// ─── Fraud Detection ─────────────────────────────────────────────
const detectFraud = (opportunity) =>
  tryPost(`${process.env.FRAUD_DETECTION_SERVICE_URL}/api/detect`, {
    opportunityId: String(opportunity._id),
    title: opportunity.title,
    description: opportunity.description,
    employerId: String(opportunity.postedByUserId),
    compensationRange: opportunity.compensationRange,
    location: opportunity.location,
  });

// ─── CV Generation ───────────────────────────────────────────────
const generateCV = ({ profileId, templateType, opportunityId, selectedData }) =>
  tryPost(`${process.env.CV_GENERATION_SERVICE_URL}/api/cv/generate`, {
    profileId: String(profileId),
    templateType,
    opportunityId: opportunityId ? String(opportunityId) : null,
    selectedData: selectedData || {},
  });

// ─── Learning Engine ─────────────────────────────────────────────
const generateLearningPath = ({ userId, targetSkill, opportunityId }) =>
  tryPost(`${process.env.LEARNING_SERVICE_URL}/api/learning/generate`, {
    userId: String(userId),
    targetSkill,
    opportunityId: opportunityId ? String(opportunityId) : null,
  });

module.exports = {
  scoreMatch,
  getRecommendations,
  triggerOpportunityMatch,
  detectFraud,
  generateCV,
  generateLearningPath,
};
