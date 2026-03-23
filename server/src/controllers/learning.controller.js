const axios = require('axios');
const LearningPath = require('../models/LearningPath');
const logger = require('../utils/logger');

exports.generateLearningPath = async (req, res) => {
  try {
    const { targetSkill, opportunityId } = req.body;
    const response = await axios.post(
      `${process.env.LEARNING_SERVICE_URL}/api/learning/generate`,
      { userId: req.user._id.toString(), targetSkill, opportunityId }
    );

    const path = await LearningPath.create({
      userId: req.user._id,
      targetSkill,
      resources: response.data.resources || [],
    });

    res.status(201).json({ learningPath: path });
  } catch (error) {
    logger.warn('Learning service unavailable:', error.message);
    res.status(503).json({ error: 'Learning service unavailable.' });
  }
};

exports.getMyLearningPaths = async (req, res) => {
  try {
    const paths = await LearningPath.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ learningPaths: paths });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch learning paths.' });
  }
};

exports.updateProgress = async (req, res) => {
  try {
    const { resourceIndex, isCompleted } = req.body;
    const path = await LearningPath.findOne({ _id: req.params.id, userId: req.user._id });
    if (!path) return res.status(404).json({ error: 'Learning path not found.' });

    if (resourceIndex !== undefined && path.resources[resourceIndex]) {
      path.resources[resourceIndex].isCompleted = isCompleted;
    }

    const completed = path.resources.filter((r) => r.isCompleted).length;
    path.progress = Math.round((completed / path.resources.length) * 100);
    if (path.progress === 100) path.status = 'completed';

    await path.save();
    res.json({ learningPath: path });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update progress.' });
  }
};
