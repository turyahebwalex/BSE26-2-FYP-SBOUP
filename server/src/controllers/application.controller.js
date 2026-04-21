const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Profile = require('../models/Profile');
const mlService = require('../services/ml.service');
const notify = require('../services/notification.service');
const logger = require('../utils/logger');

exports.applyForOpportunity = async (req, res) => {
  try {
    const { opportunityId, coverLetter, profileId, cvId, attachments } = req.body;

    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity || opportunity.status !== 'published') {
      return res.status(400).json({ error: 'Opportunity not available.' });
    }

    const existing = await Application.findOne({ profileId, opportunityId });
    if (existing) return res.status(400).json({ error: 'Already applied.' });

    // Sanity-check the profile belongs to the caller
    const profile = await Profile.findOne({ _id: profileId, userId: req.user._id });
    if (!profile) return res.status(403).json({ error: 'Not authorised for that profile.' });

    // Compute match score from the matching engine (fire-and-cache).
    let matchScore = 0;
    let matchBreakdown = { skillScore: 0, experienceScore: 0, collaborativeScore: 0 };
    const matchResult = await mlService.scoreMatch({ profileId, opportunityId });
    if (matchResult.ok) {
      matchScore = matchResult.data.matchScore || 0;
      matchBreakdown = matchResult.data.breakdown || matchBreakdown;
    }

    const application = await Application.create({
      profileId,
      opportunityId,
      cvId: cvId || null,
      coverLetter,
      matchScore,
      matchBreakdown,
      attachments: attachments || [],
    });

    opportunity.applicationCount += 1;
    await opportunity.save();

    await notify.create({
      userId: opportunity.postedByUserId,
      type: 'application_update',
      content: `New application received for "${opportunity.title}" (match ${Math.round(matchScore)}).`,
      metadata: { applicationId: application._id, opportunityId, matchScore },
    });

    res.status(201).json({ application });
  } catch (error) {
    logger.error('Apply error:', error);
    res.status(500).json({ error: 'Failed to submit application.' });
  }
};

exports.getMyApplications = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.json({ applications: [] });

    const applications = await Application.find({ profileId: profile._id })
      .populate({
        path: 'opportunityId',
        populate: { path: 'companyId', select: 'name logoUrl' },
      })
      .sort({ submittedAt: -1 });
    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch applications.' });
  }
};

exports.getApplicationsForOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findOne({
      _id: req.params.opportunityId,
      postedByUserId: req.user._id,
    });
    if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });

    const applications = await Application.find({ opportunityId: req.params.opportunityId })
      .populate({
        path: 'profileId',
        populate: { path: 'userId', select: 'fullName email' },
      })
      .sort({ matchScore: -1 });
    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch applications.' });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const application = await Application.findById(req.params.id)
      .populate('opportunityId')
      .populate('profileId');

    if (!application) return res.status(404).json({ error: 'Application not found.' });

    if (application.opportunityId.postedByUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    application.status = status;
    await application.save();

    await notify.create({
      userId: application.profileId.userId,
      type: 'application_update',
      content: `Your application for "${application.opportunityId.title}" has been ${status.replace('_', ' ')}.`,
      metadata: { applicationId: application._id },
    });

    res.json({ application });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update application status.' });
  }
};

exports.withdrawApplication = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    const application = await Application.findOneAndUpdate(
      { _id: req.params.id, profileId: profile?._id },
      { status: 'withdrawn' },
      { new: true }
    );
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    res.json({ application });
  } catch (error) {
    res.status(500).json({ error: 'Failed to withdraw application.' });
  }
};
