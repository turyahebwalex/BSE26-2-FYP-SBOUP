const Company = require('../models/Company');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Create a company. Auto-links the creating employer to it
 * (unless they are already linked to another company).
 */
exports.createCompany = async (req, res) => {
  try {
    const existing = await Company.findOne({ name: req.body.name });
    if (existing) return res.status(400).json({ error: 'Company name already taken.' });

    const company = await Company.create(req.body);

    if (req.user.role === 'employer' && !req.user.companyId) {
      await User.findByIdAndUpdate(req.user._id, { companyId: company._id });
    }
    res.status(201).json({ company });
  } catch (error) {
    logger.error('Create company error:', error);
    res.status(500).json({ error: 'Failed to create company.' });
  }
};

exports.getCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, verificationStatus } = req.query;
    const filter = {};
    if (verificationStatus) filter.verificationStatus = verificationStatus;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [companies, total] = await Promise.all([
      Company.find(filter).sort({ name: 1 }).skip(skip).limit(Number(limit)),
      Company.countDocuments(filter),
    ]);
    res.json({ companies, pagination: { page: Number(page), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch companies.' });
  }
};

exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    res.json({ company });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch company.' });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    // Only admins or linked employer may edit
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const isLinkedEmployer =
      req.user.role === 'employer' && req.user.companyId?.toString() === company._id.toString();
    if (req.user.role !== 'admin' && !isLinkedEmployer) {
      return res.status(403).json({ error: 'Not authorised to edit this company.' });
    }

    // Verification status changes are admin-only
    if (req.body.verificationStatus && req.user.role !== 'admin') {
      delete req.body.verificationStatus;
    }

    Object.assign(company, req.body);
    await company.save();
    res.json({ company });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update company.' });
  }
};

exports.setVerificationStatus = async (req, res) => {
  try {
    const { verificationStatus, trustScore } = req.body;
    const update = {};
    if (verificationStatus) update.verificationStatus = verificationStatus;
    if (typeof trustScore === 'number') update.trustScore = trustScore;

    const company = await Company.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    res.json({ company });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update verification.' });
  }
};
