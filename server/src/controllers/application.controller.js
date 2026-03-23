const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Notification = require('../models/Notification');
const axios = require('axios');
const logger = require('../utils/logger');

exports.applyForOpportunity = async (req, res) => {
  try {
    const { opportunityId, coverLetter, profileId } = req.body;

    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity || opportunity.status !== 'published') {
      return res.status(400).json({ error: 'Opportunity not available.' });
    }

    // Check for duplicate application
    const existing = await Application.findOne({ profileId, opportunityId });
    if (existing) return res.status(400).json({ error: 'Already applied.' });

    // Get match score from matching engine
    let matchScore = 0;
    try {
      const matchRes = await axios.post(
        `${process.env.MATCHING_SERVICE_URL}/api/match/score`,
        { profileId, opportunityId }
      );
      matchScore = matchRes.data.matchScore || 0;
    } catch (err) {
      logger.warn('Matching service unavailable');
    }

    const application = await Application.create({
      profileId,
      opportunityId,
      coverLetter,
      matchScore,
      attachments: req.body.attachments || [],
    });

    // Update application count
    opportunity.applicationCount += 1;
    await opportunity.save();

    // Notify employer
    await Notification.create({
      userId: opportunity.employerId,
      type: 'application_update',
      content: `New application received for "${opportunity.title}"`,
      metadata: { applicationId: application._id, opportunityId },
    });

    res.status(201).json({ application });
  } catch (error) {
    logger.error('Apply error:', error);
    res.status(500).json({ error: 'Failed to submit application.' });
  }
};

exports.getMyApplications = async (req, res) => {
  try {
    const Profile = require('../models/Profile');
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.json({ applications: [] });

    const applications = await Application.find({ profileId: profile._id })
      .populate('opportunityId')
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
      employerId: req.user._id,
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

    // Verify employer owns the opportunity
    if (application.opportunityId.employerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    application.status = status;
    await application.save();

    // Notify worker
    await Notification.create({
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
