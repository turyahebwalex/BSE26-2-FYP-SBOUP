const LearningPath = require('../models/LearningPath');
const Profile = require('../models/Profile');
const logger = require('../utils/logger');
const ml = require('../services/ml.service');

// Map the AI service's `data` envelope onto a LearningPath document.
// Persisting the rich fields (analysisSummary, pathwayRationale,
// matchBreakdown, aliasHints, per-resource whyThisCourse / bridgesSkill /
// difficultyLevel / priceLabel) means the §6.2.4 Upskill UI can render
// them on every load — not just at the moment of generation.
const persistLearningPath = async ({ userId, targetSkill, opportunityId }, data) => {
  return LearningPath.create({
    userId,
    opportunityId: opportunityId || null,
    targetSkill: targetSkill || data.targetSkill || (data.missingSkills && data.missingSkills[0]) || 'General upskilling',
    consistencyMode: data.consistencyMode || 'standalone',
    missingSkills: data.missingSkills || [],
    criticalGapCount: data.criticalGapCount || 0,
    analysisSummary: data.analysisSummary || '',
    pathwayRationale: data.pathwayRationale || '',
    matchBreakdown: data.matchBreakdown || null,
    aliasHints: data.aliasHints || [],
    resources: Array.isArray(data.resources) ? data.resources : [],
    skillGapLogId: data.skillGapLogId || null,
  });
};

exports.generateLearningPath = async (req, res) => {
  try {
    const { targetSkill, opportunityId } = req.body;
    if (!targetSkill && !opportunityId) {
      return res.status(400).json({ error: 'Provide either targetSkill or opportunityId.' });
    }

    const result = await ml.generateLearningPath({
      userId: req.user._id,
      targetSkill,
      opportunityId,
    });

    if (!result.ok) {
      logger.warn(`Learning engine unavailable: ${result.error}`);
      return res.status(503).json({ error: 'Learning service unavailable.' });
    }

    const payload = result.data?.data || result.data || {};
    const path = await persistLearningPath(
      { userId: req.user._id, targetSkill, opportunityId },
      payload
    );

    res.status(201).json({ learningPath: path });
  } catch (error) {
    logger.warn(`generateLearningPath: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate learning path.' });
  }
};

exports.getMyLearningPaths = async (req, res) => {
  try {
    const paths = await LearningPath.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ learningPaths: paths });
  } catch (error) {
    logger.warn(`getMyLearningPaths: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch learning paths.' });
  }
};

// Pure analysis — no resource fetch, no DB write. Proxies the AI
// service's /api/learning/skill-gaps so the mobile breakdown card can
// surface aliasHints and proficiencyShortfalls without committing the
// worker to a full pathway.
exports.analyseSkillGaps = async (req, res) => {
  try {
    const { opportunityId } = req.body;
    if (!opportunityId) {
      return res.status(400).json({ error: 'opportunityId is required.' });
    }
    const profile = await Profile.findOne({ userId: req.user._id }).select('_id');
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const result = await ml.analyseSkillGaps({
      profileId: profile._id,
      opportunityId,
    });
    if (!result.ok) {
      return res.status(503).json({ error: 'Learning service unavailable.' });
    }
    res.json(result.data?.data || result.data || {});
  } catch (error) {
    logger.warn(`analyseSkillGaps: ${error.message}`);
    res.status(500).json({ error: 'Failed to analyse skill gaps.' });
  }
};

// Drives the §6.2.4 worker dashboard 'Close Your Skill Gaps' section.
// Returns categories the worker fits, with frequency-sorted missing skills
// per category. Derived from the matching-engine recommendations to keep
// the dashboard and the per-opportunity breakdown card consistent.
exports.getDashboardFit = async (req, res) => {
  try {
    const result = await ml.getDashboardFit({ userId: req.user._id });
    if (!result.ok) {
      return res.status(503).json({ error: 'Learning service unavailable.' });
    }
    res.json(result.data?.data || result.data || {});
  } catch (error) {
    logger.warn(`getDashboardFit: ${error.message}`);
    res.status(500).json({ error: 'Failed to load dashboard fit.' });
  }
};

exports.updateProgress = async (req, res) => {
  try {
    const { resourceIndex, isCompleted } = req.body;
    const path = await LearningPath.findOne({ _id: req.params.id, userId: req.user._id });
    if (!path) return res.status(404).json({ error: 'Learning path not found.' });

    const idx = Number(resourceIndex);
    if (!Number.isInteger(idx) || !path.resources[idx]) {
      return res.status(400).json({ error: 'Invalid resourceIndex.' });
    }
    const resource = path.resources[idx];
    const newlyCompleted = Boolean(isCompleted) && !resource.isCompleted;
    resource.isCompleted = Boolean(isCompleted);

    const completed = path.resources.filter((r) => r.isCompleted).length;
    path.progress = path.resources.length === 0
      ? 0
      : Math.round((completed / path.resources.length) * 100);
    if (path.progress === 100) path.status = 'completed';

    await path.save();

    // Fire-and-forget: tell the AI service to upsert ProfileSkill for
    // the bridged skill. Failure here is logged but does not affect the
    // local LearningPath update — the worker still sees their progress.
    // SDD §3.2.5 feedback loop closes via Mongo on the next match call.
    if (newlyCompleted && resource.url) {
      ml.markLearningProgress({
        userId: req.user._id,
        learningPathId: path._id,
        resourceUrl: resource.url,
        isCompleted: true,
      }).catch((err) => logger.warn(`learning-engine progress hook: ${err.message}`));
    }

    res.json({ learningPath: path });
  } catch (error) {
    logger.warn(`updateProgress: ${error.message}`);
    res.status(500).json({ error: 'Failed to update progress.' });
  }
};
