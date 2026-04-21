const UserCV = require('../models/UserCV');
const Profile = require('../models/Profile');
const mlService = require('../services/ml.service');
const logger = require('../utils/logger');

exports.generateCV = async (req, res) => {
  try {
    const { templateType, opportunityId, description, selectedData } = req.body;
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found. Create a profile first.' });

    const result = await mlService.generateCV({
      profileId: profile._id,
      templateType,
      opportunityId,
      selectedData,
    });

    if (!result.ok) {
      return res.status(503).json({ error: 'CV generation service unavailable.' });
    }

    const cv = await UserCV.create({
      userId: req.user._id,
      profileId: profile._id,
      opportunityId: opportunityId || null,
      templateType: templateType || 'chronological',
      cvFieldTarget: result.data.cvFieldTarget || selectedData || {},
      description: description || '',
      fileUrl: result.data.fileUrl,
      fileFormat: result.data.fileFormat || 'pdf',
    });

    res.status(201).json({ cv });
  } catch (error) {
    logger.error('CV generation error:', error);
    res.status(500).json({ error: 'Failed to generate CV.' });
  }
};

exports.getMyCVs = async (req, res) => {
  try {
    const cvs = await UserCV.find({ userId: req.user._id })
      .populate('opportunityId', 'title')
      .sort({ generatedAt: -1 });
    res.json({ cvs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CVs.' });
  }
};

exports.getCVById = async (req, res) => {
  try {
    const cv = await UserCV.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cv) return res.status(404).json({ error: 'CV not found.' });
    res.json({ cv });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CV.' });
  }
};

exports.deleteCV = async (req, res) => {
  try {
    await UserCV.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'CV deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete CV.' });
  }
};
