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

// Auto-suggest: pick the worker's most-impactful missing skills from the
// dashboard-fit response (which is the matching-engine's view of their
// gaps) and generate LearningPaths for those they don't already have. This
// is what makes upskilling feel "always-on" — the worker opens the screen
// and the system has already lined up paths for them, on top of the manual
// "Generate" button. We pre-filter against existing paths so repeated calls
// don't spam the worker with duplicates.
const SUGGEST_DEFAULT_MAX = 3;
const SUGGEST_MAX_CANDIDATES = 12; // safety cap before per-skill scoring

exports.autoSuggestPaths = async (req, res) => {
  try {
    const max = Number(req.body?.max) || SUGGEST_DEFAULT_MAX;
    const force = Boolean(req.body?.force);

    // Existing paths — used to skip skills already covered (unless `force`).
    const existing = await LearningPath.find({ userId: req.user._id })
      .select('targetSkill')
      .lean();
    const haveSkill = new Set(
      existing
        .map((p) => String(p.targetSkill || '').trim().toLowerCase())
        .filter(Boolean)
    );

    // Get the worker's per-category fit + frequency-ranked missing skills.
    // This is the same data the dashboard rail renders, so the auto-paths
    // map directly to the chips the worker can see.
    const fitResult = await ml.getDashboardFit({ userId: req.user._id });
    if (!fitResult.ok) {
      return res.status(503).json({
        error: 'Learning service unavailable.',
        generated: 0,
        paths: [],
      });
    }
    const fitData = fitResult.data?.data || fitResult.data || {};
    const categories = Array.isArray(fitData.fittingCategories)
      ? fitData.fittingCategories
      : [];

    if (categories.length === 0) {
      return res.json({ generated: 0, skipped: 0, paths: [], reason: 'no-fitting-categories' });
    }

    // Score each candidate missing skill: higher fit categories contribute
    // more, and earlier-listed (frequency-ranked) skills within a category
    // score higher. This bubbles up the gaps that block the most matches.
    const scores = new Map();
    for (const cat of categories) {
      const fit = Number(cat.fitScore || 0);
      const missing = Array.isArray(cat.missingSkills) ? cat.missingSkills : [];
      missing.forEach((skill, idx) => {
        const key = String(skill || '').trim();
        if (!key) return;
        // List position weight (1.0 → 0.1) — earlier = more frequent.
        const positionWeight = Math.max(0.1, 1 - idx * 0.15);
        const score = fit * positionWeight;
        scores.set(key, (scores.get(key) || 0) + score);
      });
    }

    const ranked = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, SUGGEST_MAX_CANDIDATES)
      .map(([skill]) => skill);

    const targets = [];
    let skipped = 0;
    for (const skill of ranked) {
      if (targets.length >= max) break;
      if (!force && haveSkill.has(skill.toLowerCase())) {
        skipped += 1;
        continue;
      }
      targets.push(skill);
    }

    if (targets.length === 0) {
      return res.json({
        generated: 0,
        skipped,
        paths: [],
        reason: 'no-new-targets',
      });
    }

    // Sequential generate. Flan-T5 inference is CPU-bound on the AI side
    // and 3 parallel requests starve each other badly — sequential lets
    // each call complete in 15-30s instead of all hitting the 150s ceiling.
    // One failure shouldn't block the rest, so we keep going on errors.
    const results = [];
    for (const targetSkill of targets) {
      try {
        const result = await ml.generateLearningPath({
          userId: req.user._id,
          targetSkill,
        });
        if (!result.ok) {
          results.push({ targetSkill, error: result.error });
          continue;
        }
        const payload = result.data?.data || result.data || {};
        const path = await persistLearningPath(
          { userId: req.user._id, targetSkill, opportunityId: null },
          payload
        );
        results.push({ targetSkill, path });
      } catch (err) {
        logger.warn(`autoSuggest generate failed for ${targetSkill}: ${err.message}`);
        results.push({ targetSkill, error: err.message });
      }
    }

    const newPaths = results.filter((r) => r.path).map((r) => r.path);
    const failures = results.filter((r) => r.error);

    res.json({
      generated: newPaths.length,
      skipped,
      paths: newPaths,
      failures: failures.length > 0 ? failures.map((f) => ({ targetSkill: f.targetSkill })) : undefined,
    });
  } catch (error) {
    logger.warn(`autoSuggestPaths: ${error.message}`);
    res.status(500).json({ error: 'Failed to auto-suggest learning paths.' });
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
