const axios = require('axios');
const CV = require('../models/CV');
const Profile = require('../models/Profile');
const logger = require('../utils/logger');

exports.generateCV = async (req, res) => {
  try {
    const { templateType, selectedData } = req.body;
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const response = await axios.post(
      `${process.env.CV_GENERATION_SERVICE_URL}/api/cv/generate`,
      { profileId: profile._id.toString(), templateType, selectedData }
    );

    const cv = await CV.create({
      profileId: profile._id,
      templateType,
      fileUrl: response.data.fileUrl,
    });

    res.status(201).json({ cv });
  } catch (error) {
    logger.warn('CV generation service unavailable:', error.message);
    res.status(503).json({ error: 'CV generation service unavailable.' });
  }
};

exports.getMyCVs = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.json({ cvs: [] });

    const cvs = await CV.find({ profileId: profile._id }).sort({ generatedAt: -1 });
    res.json({ cvs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CVs.' });
  }
};

exports.deleteCV = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    await CV.findOneAndDelete({ _id: req.params.id, profileId: profile._id });
    res.json({ message: 'CV deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete CV.' });
  }
};
