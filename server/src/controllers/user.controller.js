const Profile = require('../models/Profile');
const ProfileSkill = require('../models/ProfileSkill');
const Skill = require('../models/Skill');
const User = require('../models/User');
const Company = require('../models/Company');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────
// Avatar upload configuration
// ─────────────────────────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/avatars';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + req.user._id + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.'));
    }
  }
}).single('avatar');

exports.uploadAvatar = uploadAvatar;

// Helper function to save base64 image
const saveBase64Image = async (userId, base64Data) => {
  let buffer;
  let fileExtension = 'jpg';
  
  // Check if base64 has data URL prefix
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  
  if (matches && matches.length === 3) {
    buffer = Buffer.from(matches[2], 'base64');
    const mimeType = matches[1];
    if (mimeType === 'image/png') fileExtension = 'png';
    else if (mimeType === 'image/jpeg') fileExtension = 'jpg';
    else if (mimeType === 'image/gif') fileExtension = 'gif';
    else if (mimeType === 'image/webp') fileExtension = 'webp';
  } else {
    // Assume raw base64 without prefix
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

// ─────────────────────────────────────────────────────────────
// Existing user methods
// ─────────────────────────────────────────────────────────────
exports.updateMe = async (req, res) => {
  try {
    const allowed = ['fullName', 'phoneNumber'];
    const update = {};
    allowed.forEach((field) => { if (req.body[field]) update[field] = req.body[field]; });
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-passwordHash');
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user.' });
  }
};

// UPDATED: Supports both file upload (web) and base64 (mobile)
exports.updateAvatar = async (req, res) => {
  try {
    let avatarUrl = null;
    
    // Case 1: Base64 image from mobile app
    if (req.body.avatarBase64) {
      avatarUrl = await saveBase64Image(req.user._id, req.body.avatarBase64);
    }
    // Case 2: File upload from web
    else if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }
    else {
      return res.status(400).json({ error: 'No image provided.' });
    }
    
    // Delete old avatar if exists
    const user = await User.findById(req.user._id);
    if (user.avatar && user.avatar !== '/uploads/avatars/default-avatar.png') {
      const oldAvatarPath = path.join(__dirname, '..', user.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }
    
    // Update user with new avatar
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl },
      { new: true }
    ).select('-passwordHash');
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('user_avatar_updated', { 
        userId: req.user._id, 
        avatar: avatarUrl 
      });
    }
    
    res.json({ 
      success: true, 
      avatar: avatarUrl, 
      user: updatedUser 
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Failed to update avatar.' });
  }
};

exports.removeAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.avatar && user.avatar !== '/uploads/avatars/default-avatar.png') {
      const avatarPath = path.join(__dirname, '..', user.avatar);
      if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
    }
    user.avatar = null;
    await user.save();
    const io = req.app.get('io');
    if (io) io.emit('user_avatar_updated', { userId: req.user._id, avatar: null });
    res.json({ success: true, message: 'Avatar removed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove avatar.' });
  }
};

exports.getMessagingPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('messagingPreferences');
    res.json({ messagingPreferences: user.messagingPreferences });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get messaging preferences.' });
  }
};

// ─────────────────────────────────────────────────────────────
// getSuggestedUsers — supports ?role=skilled_worker|employer
//
// Workers tab:   GET /users/suggested?role=skilled_worker
// Employers tab: GET /users/suggested?role=employer
// No role param: original behaviour (backward-compat)
// ─────────────────────────────────────────────────────────────
exports.getSuggestedUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { role } = req.query;

    // ── Employer path ─────────────────────────────────────────────────────────
    // Skill-overlap logic is irrelevant for employers. Instead return active
    // employer accounts ranked by company completeness and verification status.
    if (role === 'employer') {
      const employers = await User.aggregate([
        {
          $match: {
            _id:           { $ne: currentUserId },
            role:          'employer',
            accountStatus: 'active',
          },
        },
        // Join their company
        {
          $lookup: {
            from:         'companies',
            localField:   'companyId',
            foreignField: '_id',
            as:           'company',
          },
        },
        { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
        // Join their profile for location fallback
        {
          $lookup: {
            from:         'profiles',
            localField:   '_id',
            foreignField: 'userId',
            as:           'profile',
          },
        },
        { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
        // Score: verified companies first, then completeness
        {
          $addFields: {
            score: {
              $add: [
                { $cond: [{ $eq: ['$company.verificationStatus', 'verified'] }, 2, 0] },
                { $cond: [{ $ifNull: ['$company.logoUrl',     false] }, 1, 0] },
                { $cond: [{ $ifNull: ['$company.description', false] }, 1, 0] },
              ],
            },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 20 },
        {
          $project: {
            _id:         0,
            id:          '$_id',
            name:        '$fullName',
            avatar:      '$avatar',
            online:      '$isOnline',
            role:        '$role',
            companyId:   '$company._id',
            companyName: '$company.name',
            industry:    '$company.industry',
            location:    { $ifNull: ['$company.location', '$profile.location'] },
            title:       '$company.name',
          },
        },
      ]);

      return res.json({ users: employers });
    }

    // ── Worker path (original logic + optional role filter) ───────────────────
    const currentProfile = await Profile.findOne({ userId: currentUserId });
    if (!currentProfile) return res.status(200).json({ users: [] });

    const currentProfileSkills = await ProfileSkill.find({ profileId: currentProfile._id }).select('skillId');
    const currentSkillIds      = currentProfileSkills.map(ps => ps.skillId);
    let currentSkillNames      = [];
    if (currentSkillIds.length) {
      const skillDocs   = await Skill.find({ _id: { $in: currentSkillIds } });
      currentSkillNames = skillDocs.map(s => s.skillName);
    }
    const hasSkills       = currentSkillNames.length > 0;
    const currentLocation = currentProfile.location || null;
    const currentTitle    = currentProfile.title    || null;

    const suggested = await Profile.aggregate([
      { $match: { userId: { $ne: currentUserId }, visibility: 'public' } },
      { $lookup: { from: 'users',         localField: 'userId',    foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      // Apply role filter inside pipeline when provided
      ...(role ? [{ $match: { 'user.role': role } }] : []),
      { $match: { 'user.accountStatus': 'active' } },
      { $lookup: { from: 'profileskills', localField: '_id',      foreignField: 'profileId', as: 'candidateProfileSkills' } },
      { $lookup: { from: 'skills',        localField: 'candidateProfileSkills.skillId', foreignField: '_id', as: 'candidateSkillsFull' } },
      { $addFields: { candidateSkillNames: { $map: { input: '$candidateSkillsFull', as: 'sk', in: '$$sk.skillName' } }, currentSkillNames } },
      {
        $addFields: {
          skillOverlap: { $size: { $setIntersection: ['$currentSkillNames', '$candidateSkillNames'] } },
          locationMatch: {
            $cond: [
              { $and: [{ $ne: ['$location', null] }, { $ne: [currentLocation, null] }, { $eq: ['$location', currentLocation] }] },
              1, 0,
            ],
          },
          titleSimilarity: {
            $cond: [
              { $and: [{ $ne: ['$title', null] }, { $ne: [currentTitle, null] }, { $regexMatch: { input: '$title', regex: currentTitle, options: 'i' } }] },
              1, 0,
            ],
          },
          completeness: {
            $add: [
              { $cond: [{ $ifNull: ['$user.avatar', false] }, 1, 0] },
              { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$bio', ''] } }, 20] }, 1, 0] },
              { $cond: [{ $gt: [{ $size: '$candidateProfileSkills' }, 2] }, 1, 0] },
            ],
          },
        },
      },
      {
        $match: hasSkills
          ? { $or: [{ skillOverlap: { $gt: 0 } }, { locationMatch: 1 }, { titleSimilarity: 1 }] }
          : { $or: [{ locationMatch: 1 }, { titleSimilarity: 1 }] },
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ['$skillOverlap', 10] },
              { $multiply: ['$locationMatch', 3] },
              { $multiply: ['$titleSimilarity', 2] },
              '$completeness',
            ],
          },
        },
      },
      { $sort: { score: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id:      0,
          id:       '$userId',
          name:     '$user.fullName',
          avatar:   '$user.avatar',
          online:   '$user.isOnline',
          role:     '$user.role',
          location: 1,
          title:    1,
          match:    { $min: [{ $multiply: ['$score', 5] }, 100] },
        },
      },
    ]);

    res.json({ users: suggested });
  } catch (error) {
    console.error('Suggested users error:', error);
    res.status(500).json({ error: 'Failed to load suggestions' });
  }
};

// ─────────────────────────────────────────────────────────────
// searchUsers — supports ?role=skilled_worker|employer
//
// Workers tab:   GET /users/search?query=john&role=skilled_worker
// Employers tab: GET /users/search?query=john&role=employer
// No role param: original behaviour (backward-compat)
// ─────────────────────────────────────────────────────────────
exports.searchUsers = async (req, res) => {
  try {
    const { query, role } = req.query;

    // Return empty for short queries (avoids AxiosError on each keystroke)
    if (!query || query.trim().length < 2) {
      return res.json({ users: [] });
    }

    const currentUserId = req.user._id;
    const regex         = new RegExp(query.trim(), 'i');

    // ── Employer search ───────────────────────────────────────────────────────
    // Search across user fullName AND company name so typing "Acme" or
    // the employer's name both work.
    if (role === 'employer') {
      // 1. Employers matching by name
      const usersByName = await User.find({
        _id:           { $ne: currentUserId },
        role:          'employer',
        accountStatus: 'active',
        fullName:      regex,
      }).select('fullName avatar role isOnline companyId').lean();

      // 2. Companies matching by name → find their linked employers
      const matchingCompanies = await Company.find({ name: regex })
        .select('_id name industry location')
        .lean();

      let employersFromCompanies = [];
      if (matchingCompanies.length) {
        const companyIds = matchingCompanies.map(c => c._id);
        employersFromCompanies = await User.find({
          _id:           { $ne: currentUserId },
          role:          'employer',
          accountStatus: 'active',
          companyId:     { $in: companyIds },
        }).select('fullName avatar role isOnline companyId').lean();
      }

      // Merge and deduplicate
      const seen        = new Set();
      const allEmployers = [];
      [...usersByName, ...employersFromCompanies].forEach(u => {
        const id = u._id.toString();
        if (!seen.has(id)) { seen.add(id); allEmployers.push(u); }
      });

      if (allEmployers.length === 0) return res.json({ users: [] });

      // Enrich with company info
      const companyIds = [...new Set(allEmployers.map(u => u.companyId).filter(Boolean))];
      const companies  = await Company.find({ _id: { $in: companyIds } })
        .select('name industry location logoUrl verificationStatus')
        .lean();
      const companyMap = new Map(companies.map(c => [c._id.toString(), c]));

      // Profile for location fallback
      const userIds  = allEmployers.map(u => u._id);
      const profiles = await Profile.find({ userId: { $in: userIds } }).select('userId location').lean();
      const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));

      const formatted = allEmployers.map(user => {
        const company = user.companyId ? companyMap.get(user.companyId.toString()) : null;
        const profile = profileMap.get(user._id.toString());
        return {
          id:          user._id,
          name:        user.fullName,
          avatar:      user.avatar,
          role:        user.role,
          isOnline:    user.isOnline,
          companyId:   company?._id   || null,
          companyName: company?.name  || null,
          industry:    company?.industry || null,
          location:    company?.location || profile?.location || '',
          title:       company?.name  || '',
        };
      });

      return res.json({ users: formatted });
    }

    // ── Worker / general search (original logic + optional role filter) ────────
    const userFilter = {
      _id:           { $ne: currentUserId },
      accountStatus: 'active',
      $or:           [{ fullName: regex }, { email: regex }],
    };
    if (role === 'skilled_worker') userFilter.role = 'skilled_worker';

    const usersByName = await User.find(userFilter)
      .select('fullName email avatar role isOnline lastSeenAt')
      .lean();

    const profilesByTitle = await Profile.find({
      userId:     { $ne: currentUserId },
      visibility: 'public',
      title:      regex,
    }).select('userId').lean();
    const userIdsFromTitle = profilesByTitle.map(p => p.userId);

    const matchingSkills = await Skill.find({ skillName: regex }).select('_id').lean();
    const skillIds       = matchingSkills.map(s => s._id);
    let userIdsFromSkills = [];
    if (skillIds.length) {
      const profileSkills = await ProfileSkill.find({ skillId: { $in: skillIds } })
        .populate('profileId', 'userId')
        .lean();
      userIdsFromSkills = [...new Set(profileSkills.map(ps => ps.profileId?.userId).filter(Boolean))];
    }

    const userIdSet = new Set();
    usersByName.forEach(u => userIdSet.add(u._id.toString()));
    userIdsFromTitle.forEach(id => userIdSet.add(id.toString()));
    userIdsFromSkills.forEach(id => userIdSet.add(id.toString()));

    if (userIdSet.size === 0) return res.json({ users: [] });

    const finalUserFilter = {
      _id:           { $in: Array.from(userIdSet) },
      accountStatus: 'active',
    };
    if (role === 'skilled_worker') finalUserFilter.role = 'skilled_worker';

    const users    = await User.find(finalUserFilter)
      .select('fullName email avatar role isOnline lastSeenAt')
      .lean();
    const profiles = await Profile.find({ userId: { $in: Array.from(userIdSet) } })
      .select('userId title location')
      .lean();
    const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));

    const scored = users.map(user => {
      let score = 0;
      if (user.fullName.match(regex)) score += 2;
      if (user.email?.match(regex))   score += 1;
      const profile = profileMap.get(user._id.toString());
      if (profile?.title?.match(regex)) score += 1;
      if (userIdsFromSkills.map(id => id.toString()).includes(user._id.toString())) score += 2;
      return { ...user, profile, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const formatted = scored.map(user => ({
      id:                user._id,
      name:              user.fullName,
      email:             user.email,
      avatar:            user.avatar,
      role:              user.role,
      isOnline:          user.isOnline,
      lastSeenAt:        user.lastSeenAt,
      lastSeenFormatted: user.getLastSeenFormatted?.() || 'Offline',
      location:          user.profile?.location || '',
      title:             user.profile?.title    || '',
      match:             Math.min(Math.floor(user.score * 10) + 30, 98),
    }));

    res.json({ users: formatted });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users.' });
  }
};

// ─────────────────────────────────────────────────────────────
// searchLocations
// ─────────────────────────────────────────────────────────────
exports.searchLocations = async (req, res) => {
  try {
    const { query } = req.query;
    let locations = [];

    if (!query || query.trim().length < 2) {
      const topLocations = await Profile.aggregate([
        { $match: { location: { $exists: true, $ne: '' }, visibility: 'public' } },
        { $group: { _id: '$location', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]);
      locations = topLocations.map(loc => ({
        id:    loc._id.replace(/\s/g, '_').toLowerCase(),
        name:  loc._id,
        type:  'City/Region',
        count: loc.count,
      }));
      return res.json({ locations });
    }

    const regex = new RegExp(query.trim(), 'i');
    const matchedLocations = await Profile.distinct('location', {
      location:   { $regex: regex },
      visibility: 'public',
    });

    const results = await Promise.all(matchedLocations.map(async (loc) => {
      const count = await Profile.countDocuments({ location: loc, visibility: 'public' });
      return { id: loc.replace(/\s/g, '_').toLowerCase(), name: loc, type: 'City/Region', count };
    }));

    res.json({ locations: results });
  } catch (error) {
    console.error('Search locations error:', error);
    res.status(500).json({ error: 'Failed to search locations.' });
  }
};

// ─────────────────────────────────────────────────────────────
// searchCompanies
// ─────────────────────────────────────────────────────────────
exports.searchCompanies = async (req, res) => {
  try {
    const { query } = req.query;
    let companies = [];

    if (!query || query.trim().length < 2) {
      companies = await Company.find()
        .sort({ name: 1 })
        .limit(30)
        .select('name industry location logo website');
    } else {
      const regex = new RegExp(query.trim(), 'i');
      companies = await Company.find({ name: regex })
        .limit(30)
        .select('name industry location logo website');
    }

    const results = companies.map(c => ({
      id:       c._id,
      name:     c.name,
      industry: c.industry || 'Not specified',
      location: c.location || 'Unknown',
      logo:     c.logo,
    }));

    res.json({ companies: results });
  } catch (error) {
    console.error('Company search error:', error);
    res.status(500).json({ error: 'Failed to search companies.' });
  }
};

// ─────────────────────────────────────────────────────────────
// getUsersByLocation
// ─────────────────────────────────────────────────────────────
exports.getUsersByLocation = async (req, res) => {
  try {
    const { location } = req.params;
    if (!location || location.trim().length < 2) {
      return res.status(400).json({ error: 'Location must be at least 2 characters.' });
    }
    const regex    = new RegExp(location, 'i');
    const profiles = await Profile.find({ location: { $regex: regex }, visibility: 'public' }).select('userId');
    const userIds  = profiles.map(p => p.userId);
    const users    = await User.find({
      _id:           { $in: userIds },
      role:          'skilled_worker',
      accountStatus: 'active',
    }).select('fullName email avatar role isOnline lastSeenAt');

    const formatted = users.map(user => ({
      id:       user._id,
      name:     user.fullName,
      avatar:   user.avatar,
      role:     user.role,
      isOnline: user.isOnline,
      title:    user.profile?.title || '',
      location,
    }));
    res.json({ users: formatted });
  } catch (error) {
    console.error('Get users by location error:', error);
    res.status(500).json({ error: 'Failed to fetch users by location.' });
  }
};

// ─────────────────────────────────────────────────────────────
// updateMessagingPreferences
// ─────────────────────────────────────────────────────────────
exports.updateMessagingPreferences = async (req, res) => {
  try {
    const { emailNotifications, pushNotifications, soundEnabled, readReceipts } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        messagingPreferences: {
          emailNotifications: emailNotifications !== undefined ? emailNotifications : true,
          pushNotifications:  pushNotifications  !== undefined ? pushNotifications  : true,
          soundEnabled:       soundEnabled        !== undefined ? soundEnabled        : true,
          readReceipts:       readReceipts        !== undefined ? readReceipts        : true,
        },
      },
      { new: true }
    ).select('-passwordHash');
    res.json({ success: true, messagingPreferences: user.messagingPreferences });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update messaging preferences.' });
  }
};

// ─────────────────────────────────────────────────────────────
// updateOnlineStatus
// ─────────────────────────────────────────────────────────────
exports.updateOnlineStatus = async (req, res) => {
  try {
    const { isOnline, socketId } = req.body;
    await req.user.updateOnlineStatus(isOnline, socketId);
    const io = req.app.get('io');
    if (io) {
      io.emit('user_status_changed', {
        userId:     req.user._id,
        isOnline:   req.user.isOnline,
        lastSeenAt: req.user.lastSeenAt,
      });
    }
    res.json({ success: true, isOnline: req.user.isOnline, lastSeenAt: req.user.lastSeenAt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update online status.' });
  }
};

// ─────────────────────────────────────────────────────────────
// getUserStatus
// ─────────────────────────────────────────────────────────────
exports.getUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('isOnline lastSeenAt fullName avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      userId:           user._id,
      fullName:         user.fullName,
      avatar:           user.avatar,
      isOnline:         user.isOnline,
      lastSeenAt:       user.lastSeenAt,
      lastSeenFormatted: user.getLastSeenFormatted(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user status.' });
  }
};

// ─────────────────────────────────────────────────────────────
// getMe
// ─────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────
// getMultipleUsersStatus
// ─────────────────────────────────────────────────────────────
exports.getMultipleUsersStatus = async (req, res) => {
  try {
    const { userIds } = req.body;
    const users = await User.find(
      { _id: { $in: userIds } },
      'fullName avatar isOnline lastSeenAt role'
    );
    const statuses = users.map(user => ({
      userId:           user._id,
      fullName:         user.fullName,
      avatar:           user.avatar,
      role:             user.role,
      isOnline:         user.isOnline,
      lastSeenAt:       user.lastSeenAt,
      lastSeenFormatted: user.getLastSeenFormatted(),
    }));
    res.json({ statuses });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users status.' });
  }
};

// ─────────────────────────────────────────────────────────────
// toggleBlockUser
// ─────────────────────────────────────────────────────────────
exports.toggleBlockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user  = await User.findById(req.user._id);
    const index = user.blockedUsers.indexOf(userId);
    if (index === -1) {
      user.blockedUsers.push(userId);
      await user.save();
      res.json({ success: true, action: 'blocked', userId });
    } else {
      user.blockedUsers.splice(index, 1);
      await user.save();
      res.json({ success: true, action: 'unblocked', userId });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update block status.' });
  }
};

// ─────────────────────────────────────────────────────────────
// unblockUser
// ─────────────────────────────────────────────────────────────
exports.unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user  = await User.findById(req.user._id);
    const index = user.blockedUsers.indexOf(userId);
    if (index !== -1) {
      user.blockedUsers.splice(index, 1);
      await user.save();
    }
    res.json({ success: true, action: 'unblocked', userId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unblock user.' });
  }
};

// ─────────────────────────────────────────────────────────────
// getBlockedUsers
// ─────────────────────────────────────────────────────────────
exports.getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('blockedUsers', 'fullName email avatar role');
    res.json({ blockedUsers: user.blockedUsers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get blocked users.' });
  }
};

// ─────────────────────────────────────────────────────────────
// getUserConversations
// ─────────────────────────────────────────────────────────────
exports.getUserConversations = async (req, res) => {
  try {
    const Message = require('../models/Message');
    const userId  = req.user._id;
    const grouped = await Message.aggregate([
      {
        $match: {
          $or:       [{ senderId: userId }, { receiverId: userId }],
          deletedBy: { $ne: userId },
        },
      },
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ['$senderId', userId] }, '$receiverId', '$senderId'] },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$receiverId', userId] }, { $eq: ['$readStatus', false] }] },
                1, 0,
              ],
            },
          },
        },
      },
      { $sort: { 'lastMessage.sentAt': -1 } },
    ]);

    const otherIds = grouped.map(g => g._id);
    const users    = await User.find({ _id: { $in: otherIds } })
      .select('fullName email role avatar isOnline lastSeenAt')
      .lean();
    const userMap  = new Map(users.map(u => [u._id.toString(), u]));

    const conversations = grouped.map(g => {
      const otherUser = userMap.get(g._id.toString());
      return {
        otherUser: {
          _id:        otherUser?._id      || g._id,
          fullName:   otherUser?.fullName || 'Unknown User',
          email:      otherUser?.email,
          role:       otherUser?.role,
          avatar:     otherUser?.avatar,
          isOnline:   otherUser?.isOnline  || false,
          lastSeenAt: otherUser?.lastSeenAt,
        },
        lastMessage: {
          _id:        g.lastMessage._id,
          content:    g.lastMessage.content,
          attachments:g.lastMessage.attachments,
          sentAt:     g.lastMessage.sentAt,
          readStatus: g.lastMessage.readStatus,
          status:     g.lastMessage.status,
          senderId:   g.lastMessage.senderId,
          receiverId: g.lastMessage.receiverId,
        },
        unreadCount: g.unreadCount,
        updatedAt:   g.lastMessage?.sentAt,
      };
    });

    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
};

// ─────────────────────────────────────────────────────────────
// getTypingStatus
// ─────────────────────────────────────────────────────────────
exports.getTypingStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('typingTo typingExpires');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isTyping =
      user.typingTo &&
      user.typingTo.toString() === req.user._id.toString() &&
      user.typingExpires > new Date();
    res.json({ isTyping, userId: user._id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get typing status.' });
  }
};

// ─────────────────────────────────────────────────────────────
// changePassword
// ─────────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user    = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect.' });
    user.passwordHash = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password.' });
  }
};

// ─────────────────────────────────────────────────────────────
// deactivateAccount
// ─────────────────────────────────────────────────────────────
exports.deactivateAccount = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { accountStatus: 'deactivated' });
    res.json({ message: 'Account deactivated.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to deactivate account.' });
  }
};