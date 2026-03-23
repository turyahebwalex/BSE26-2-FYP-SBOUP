const User = require('../models/User');

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

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect.' });

    user.passwordHash = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password.' });
  }
};

exports.deactivateAccount = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { accountStatus: 'deactivated' });
    res.json({ message: 'Account deactivated.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to deactivate account.' });
  }
};
