const LearningPath = require('../models/LearningPath');
const Profile = require('../models/Profile');
const Opportunity = require('../models/Opportunity');
const logger = require('../utils/logger');
const ml = require('../services/ml.service');
const notificationService = require('../services/notification.service');

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

// Look up an existing path that would duplicate a /generate request, so
// we can return it instead of inserting another row. Opportunity-driven
// requests dedupe on opportunityId; freeform requests dedupe on the
// normalised targetSkill string. This is what makes 'Bridge a skill gap'
// idempotent — tapping the CTA twice doesn't leave the worker with two
// identical Marketing paths cluttering the list.
const findExistingPath = async ({ userId, targetSkill, opportunityId }) => {
  if (opportunityId) {
    return LearningPath.findOne({ userId, opportunityId });
  }
  if (targetSkill) {
    const normalised = String(targetSkill).trim();
    if (!normalised) return null;
    // Case-insensitive exact match — anchored regex avoids substring
    // collisions (e.g. 'React' would otherwise match 'React Native').
    return LearningPath.findOne({
      userId,
      opportunityId: null,
      targetSkill: new RegExp(`^${normalised.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
  }
  return null;
};

exports.generateLearningPath = async (req, res) => {
  try {
    const { targetSkill, opportunityId } = req.body;
    if (!targetSkill && !opportunityId) {
      return res.status(400).json({ error: 'Provide either targetSkill or opportunityId.' });
    }

    const existing = await findExistingPath({
      userId: req.user._id,
      targetSkill,
      opportunityId,
    });
    if (existing) {
      // Surface the existing path with a marker so the mobile UI can show
      // a "you already have this — viewing it" toast instead of pretending
      // a fresh one was created.
      return res.status(200).json({ learningPath: existing, alreadyExists: true });
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
    const wasCompleted = Boolean(resource.isCompleted);
    const newlyCompleted = Boolean(isCompleted) && !wasCompleted;
    const wasPathCompleted = path.progress === 100;
    resource.isCompleted = Boolean(isCompleted);

    const completed = path.resources.filter((r) => r.isCompleted).length;
    path.progress = path.resources.length === 0
      ? 0
      : Math.round((completed / path.resources.length) * 100);
    if (path.progress === 100) path.status = 'completed';

    await path.save();

    // Close the SDD §3.2.5 feedback loop synchronously when the worker
    // marks a resource done: upsert ProfileSkill via the AI service, then
    // rescore the originating opportunity so the response carries the
    // fresh match score. Awaiting (rather than fire-and-forget) lets us
    // tell the worker exactly how much their match improved — without it,
    // the mobile alert would show stale data and the worker has no way
    // to know whether their effort moved the needle.
    let newMatchScore = null;
    let previousMatchScore = null;
    let opportunityTitle = null;
    let bridgedSkill = null;
    const pathJustCompleted = path.progress === 100 && !wasPathCompleted;

    if (newlyCompleted && resource.url) {
      bridgedSkill = resource.bridgesSkill || path.targetSkill || null;

      // Capture the pre-bridge score on the path's opportunity FIRST so
      // we can show the worker the delta after the upsert lands. Without
      // a baseline we can only say "your match is X%" — with one we can
      // say "your match jumped from X% to Y%", which is the feedback the
      // worker is asking for.
      if (path.opportunityId) {
        const profile = await Profile.findOne({ userId: req.user._id })
          .select('_id')
          .lean();
        if (profile) {
          const pre = await ml.scoreMatch({
            profileId: profile._id,
            opportunityId: path.opportunityId,
          });
          if (pre.ok) {
            const raw = pre.data?.matchScore ?? pre.data?.score ?? pre.data?.data?.matchScore;
            if (typeof raw === 'number') previousMatchScore = Math.round(raw);
          }
        }
      }

      const hookResult = await ml.markLearningProgress({
        userId: req.user._id,
        learningPathId: path._id,
        resourceUrl: resource.url,
        // Without bridgesSkill the AI service audit-logs the resource
        // but skips the ProfileSkill upsert — which means the matching
        // engine still sees the gap, the dashboard still shows the
        // skill as missing, and the match score never moves. This was
        // the root cause of 'I finished the path but nothing updated'.
        bridgesSkill: bridgedSkill,
        isCompleted: true,
      });
      if (!hookResult.ok) {
        logger.warn(`learning-engine progress hook: ${hookResult.error}`);
      }

      if (path.opportunityId) {
        const profile = await Profile.findOne({ userId: req.user._id })
          .select('_id')
          .lean();
        if (profile) {
          const scoreResult = await ml.scoreMatch({
            profileId: profile._id,
            opportunityId: path.opportunityId,
          });
          if (scoreResult.ok) {
            const payload = scoreResult.data || {};
            const raw = payload.matchScore ?? payload.score ?? payload.data?.matchScore;
            if (typeof raw === 'number') newMatchScore = Math.round(raw);
          }
        }
        const opp = await Opportunity.findById(path.opportunityId).select('title').lean();
        if (opp) opportunityTitle = opp.title;
      }
    }

    // On the 0->100 transition, persist a Notification so the worker can
    // revisit the milestone from the bell-icon list. The dashboard rail
    // already drops opportunities with a 100%-complete path (filter is
    // in the AI service taxonomy_service), so this notification is the
    // primary feedback channel for "you addressed every gap on this
    // role". Fire-and-forget — a notification failure shouldn't roll
    // back the LearningPath save.
    if (pathJustCompleted) {
      const titleLabel = opportunityTitle || path.targetSkill || 'learning pathway';
      // Build the message as one sentence + an optional score line, so
      // the comma-then-clause flows naturally ("...pathway, closing
      // your X gap.") instead of "...pathway. closing your X gap.".
      const lead = bridgedSkill
        ? `You completed the ${titleLabel} pathway, closing your ${bridgedSkill} gap.`
        : `You completed the ${titleLabel} pathway.`;
      let scoreLine = '';
      if (opportunityTitle && typeof newMatchScore === 'number') {
        if (typeof previousMatchScore === 'number' && newMatchScore !== previousMatchScore) {
          const delta = newMatchScore - previousMatchScore;
          const sign = delta > 0 ? '+' : '';
          scoreLine =
            ` Your match for ${opportunityTitle} is now ${newMatchScore}% (${sign}${delta} pts).`;
        } else {
          scoreLine = ` Your match for ${opportunityTitle} is now ${newMatchScore}%.`;
        }
      } else if (bridgedSkill && !opportunityTitle) {
        scoreLine = ' Your matching scores on related roles will refresh shortly.';
      }
      const content = `${lead}${scoreLine}`;
      notificationService.create({
        userId: req.user._id,
        type: 'learning',
        title: opportunityTitle
          ? `Pathway complete — ${opportunityTitle}`
          : 'Pathway complete',
        content,
        metadata: {
          learningPathId: String(path._id),
          opportunityId: path.opportunityId ? String(path.opportunityId) : null,
          bridgedSkill,
          previousMatchScore,
          newMatchScore,
        },
      }).catch((err) => logger.warn(`learning completion notification: ${err.message}`));
    }

    res.json({
      learningPath: path,
      pathJustCompleted,
      bridgedSkill,
      previousMatchScore,
      newMatchScore,
      opportunityTitle,
    });
  } catch (error) {
    logger.warn(`updateProgress: ${error.message}`);
    res.status(500).json({ error: 'Failed to update progress.' });
  }
};
