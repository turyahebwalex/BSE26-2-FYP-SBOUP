const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Thin wrapper around the four Python AI microservices. Every call
 * is wrapped in a try/catch so an outage of an ML service never
 * crashes the API gateway — callers receive a fallback value instead.
 */

const TIMEOUT_MS = 15_000;
// Learning generation walks Flan-T5 (CPU inference) + external resource
// providers + semantic ranking. A single call is 15-60s warm and can creep
// past 90s on cold/contended CPUs. 150s headroom prevents the gateway
// from killing a still-running AI request on slower machines.
const LEARNING_GENERATE_TIMEOUT_MS = 150_000;

const tryPost = async (url, body, opts = {}) => {
  try {
    const { data } = await axios.post(url, body, { timeout: opts.timeout || TIMEOUT_MS });
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

/**
 * Returns a Map<opportunityIdString, matchScore>. On any failure, returns
 * an empty Map so callers can fall back to 0% rather than blowing up.
 */
const batchScore = async (profileId, opportunityIds) => {
  const result = await tryPost(`${process.env.MATCHING_SERVICE_URL}/api/match/scores-batch`, {
    profileId: String(profileId),
    opportunityIds: (opportunityIds || []).map(String),
  });
  const scoreMap = new Map();
  if (result.ok && result.data?.scores) {
    for (const [k, v] of Object.entries(result.data.scores)) {
      scoreMap.set(String(k), typeof v === 'number' ? v : 0);
    }
  }
  return scoreMap;
};

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
const generateCV = ({ userId, profileId, templateType, opportunityId, selectedData, description, targetField }) =>
  tryPost(`${process.env.CV_GENERATION_SERVICE_URL}/api/cv/generate`, {
    userId: userId ? String(userId) : undefined,
    profileId: String(profileId),
    templateType,
    opportunityId: opportunityId ? String(opportunityId) : null,
    selectedData: selectedData || {},
    description: description || '',
    targetField: targetField || '',
  });

// ─── Learning Engine ─────────────────────────────────────────────
const generateLearningPath = ({ userId, targetSkill, opportunityId }) =>
  tryPost(
    `${process.env.LEARNING_SERVICE_URL}/api/learning/generate`,
    {
      userId: String(userId),
      targetSkill: targetSkill || undefined,
      opportunityId: opportunityId ? String(opportunityId) : undefined,
    },
    { timeout: LEARNING_GENERATE_TIMEOUT_MS }
  );

const analyseSkillGaps = ({ profileId, opportunityId }) =>
  tryPost(`${process.env.LEARNING_SERVICE_URL}/api/learning/skill-gaps`, {
    profileId: String(profileId),
    opportunityId: String(opportunityId),
  });

const getDashboardFit = ({ userId }) =>
  tryPost(
    `${process.env.LEARNING_SERVICE_URL}/api/learning/dashboard-fit`,
    { userId: String(userId) },
    // First call after cold start triggers MiniLM warm-up inside the
    // AI service's fallback path. Give it more headroom than the default.
    { timeout: 30_000 }
  );

// Best-effort: failure here does not block the local LearningPath update.
// The matching-engine reads profileskills fresh on every score call, so
// any successful upsert here closes the SDD §3.2.5 feedback loop on the
// next match request.
// bridgesSkill MUST be forwarded — the AI service's progress_tracker
// only upserts ProfileSkill when this field is non-null. Without it the
// completed resource gets audit-logged but the worker's skill state
// never advances, which keeps the gap visible on the dashboard and
// freezes the match score.
const markLearningProgress = ({ userId, learningPathId, resourceUrl, bridgesSkill, isCompleted }) =>
  tryPost(`${process.env.LEARNING_SERVICE_URL}/api/learning/progress`, {
    userId: String(userId),
    learningPathId: learningPathId ? String(learningPathId) : null,
    resourceUrl: String(resourceUrl),
    bridgesSkill: bridgesSkill ? String(bridgesSkill) : null,
    isCompleted: Boolean(isCompleted),
  });

module.exports = {
  scoreMatch,
  batchScore,
  getRecommendations,
  triggerOpportunityMatch,
  detectFraud,
  generateCV,
  generateLearningPath,
  analyseSkillGaps,
  getDashboardFit,
  markLearningProgress,
};
