const fs = require('fs');
const path = require('path');
const Profile = require('../models/Profile');
const ProfileSkill = require('../models/ProfileSkill');
const Experience = require('../models/Experience');
const Education = require('../models/Education');
const Preference = require('../models/Preference');
const User = require('../models/User');

const saveBase64Image = async (userId, base64Data) => {
  let buffer;
  let fileExtension = 'jpg';

  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    buffer = Buffer.from(matches[2], 'base64');
    const mimeType = matches[1];
    if (mimeType === 'image/png') fileExtension = 'png';
    else if (mimeType === 'image/jpeg') fileExtension = 'jpg';
    else if (mimeType === 'image/gif') fileExtension = 'gif';
    else if (mimeType === 'image/webp') fileExtension = 'webp';
  } else {
    buffer = Buffer.from(base64Data, 'base64');
  }

  const filename = `avatar-${userId}-${Date.now()}.${fileExtension}`;
  const uploadDir = './uploads/avatars';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, buffer);

  return `/uploads/avatars/${filename}`;
};

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

exports.getProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    const profile = await Profile.findOne({ userId }).populate('userId', 'fullName email avatar role');
    if (!profile || profile.visibility === 'private') {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const [skills, experiences, education] = await Promise.all([
      ProfileSkill.find({ profileId: profile._id }).populate('skillId'),
      Experience.find({ profileId: profile._id }).sort({ startDate: -1 }),
      Education.find({ profileId: profile._id }).sort({ startYear: -1 }),
    ]);

    res.json({
      user: profile.userId,
      profile,
      skills,
      experiences,
      education,
    });
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

// ─── Avatar ───
exports.updateAvatar = async (req, res) => {
  try {
    const { avatarBase64 } = req.body;
    if (!avatarBase64 || typeof avatarBase64 !== 'string' || avatarBase64.length === 0) {
      return res.status(400).json({ error: 'avatarBase64 is required.' });
    }

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { avatarBase64 },
      { new: true, upsert: true }
    );
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const avatarUrl = await saveBase64Image(req.user._id, avatarBase64);

    const currentUser = await User.findById(req.user._id);
    if (
      currentUser?.avatar &&
      currentUser.avatar !== '/uploads/avatars/default-avatar.png' &&
      currentUser.avatar.startsWith('/uploads/')
    ) {
      const oldAvatarPath = path.join(__dirname, '..', currentUser.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl });

    res.json({
      avatarBase64: profile.avatarBase64,
      avatar: avatarUrl,
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Failed to update avatar.' });
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

// ─── Portfolio ───
exports.addPortfolioItem = async (req, res) => {
  try {
    const { title, description, fileUrl, fileType } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user._id },
      {
        $push: {
          portfolioItems: {
            title,
            description: description || '',
            fileUrl: fileUrl || '',
            fileType: fileType || 'link',
            uploadedAt: new Date(),
          },
        },
      },
      { new: true }
    );
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const added = profile.portfolioItems[profile.portfolioItems.length - 1];
    res.status(201).json({ portfolioItem: added });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add portfolio item.' });
  }
};

exports.removePortfolioItem = async (req, res) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { portfolioItems: { _id: req.params.itemId } } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    res.json({ message: 'Portfolio item removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove portfolio item.' });
  }
};
