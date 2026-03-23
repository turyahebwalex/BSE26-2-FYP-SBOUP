const Profile = require('../models/Profile');
const ProfileSkill = require('../models/ProfileSkill');
const Experience = require('../models/Experience');
const Education = require('../models/Education');
const Preference = require('../models/Preference');

exports.createProfile = async (req, res) => {
  try {
    const existing = await Profile.findOne({ userId: req.user._id });
    if (existing) return res.status(400).json({ error: 'Profile already exists.' });

    const profile = await Profile.create({ ...req.body, userId: req.user._id });
    res.status(201).json({ profile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create profile.' });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const [skills, experiences, education, preference] = await Promise.all([
      ProfileSkill.find({ profileId: profile._id }).populate('skillId'),
      Experience.find({ profileId: profile._id }).sort({ startDate: -1 }),
      Education.find({ profileId: profile._id }).sort({ startYear: -1 }),
      Preference.findOne({ profileId: profile._id }),
    ]);

    res.json({ profile, skills, experiences, education, preference });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};

exports.getProfileById = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id).populate('userId', 'fullName email');
    if (!profile || profile.visibility === 'private') {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const [skills, experiences, education] = await Promise.all([
      ProfileSkill.find({ profileId: profile._id }).populate('skillId'),
      Experience.find({ profileId: profile._id }).sort({ startDate: -1 }),
      Education.find({ profileId: profile._id }).sort({ startYear: -1 }),
    ]);

    res.json({ profile, skills, experiences, education });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
};

// ─── Skills ───
exports.addSkill = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const profileSkill = await ProfileSkill.create({
      profileId: profile._id,
      ...req.body,
    });
    res.status(201).json({ profileSkill });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add skill.' });
  }
};

exports.removeSkill = async (req, res) => {
  try {
    await ProfileSkill.findByIdAndDelete(req.params.skillId);
    res.json({ message: 'Skill removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove skill.' });
  }
};

// ─── Experience ───
exports.addExperience = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const experience = await Experience.create({ profileId: profile._id, ...req.body });
    res.status(201).json({ experience });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add experience.' });
  }
};

exports.updateExperience = async (req, res) => {
  try {
    const experience = await Experience.findByIdAndUpdate(req.params.expId, req.body, { new: true });
    res.json({ experience });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update experience.' });
  }
};

exports.deleteExperience = async (req, res) => {
  try {
    await Experience.findByIdAndDelete(req.params.expId);
    res.json({ message: 'Experience deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete experience.' });
  }
};

// ─── Education ───
exports.addEducation = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const education = await Education.create({ profileId: profile._id, ...req.body });
    res.status(201).json({ education });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add education.' });
  }
};

exports.deleteEducation = async (req, res) => {
  try {
    await Education.findByIdAndDelete(req.params.eduId);
    res.json({ message: 'Education deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete education.' });
  }
};

// ─── Preference ───
exports.updatePreference = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const preference = await Preference.findOneAndUpdate(
      { profileId: profile._id },
      { ...req.body, profileId: profile._id },
      { new: true, upsert: true }
    );
    res.json({ preference });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences.' });
  }
};
