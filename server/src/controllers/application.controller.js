const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Profile = require('../models/Profile');
const User = require('../models/User');
const mlService = require('../services/ml.service');
const notify = require('../services/notification.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Set to true only if you still need to accept the legacy JSON `attachments`
// array on write (old app builds). Recommended: false, now that all current
// clients use multipart/form-data with cv / coverLetterFile / additionalDocs.
const ALLOW_LEGACY_JSON_ATTACHMENTS = false;

// Hard caps — keep in sync with your multer config (limits.fileSize etc.)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/jpg',
]);

// Helper: best-effort removal of a multer temp file (used when we reject
// a request after multer has already written the file to disk).
const cleanupTempFile = (file) => {
  if (!file?.path) return;
  fs.unlink(file.path, (err) => {
    if (err && err.code !== 'ENOENT') {
      logger.error('Failed to clean up temp file:', err);
    }
  });
};

const cleanupAllTempFiles = (reqFiles) => {
  if (!reqFiles) return;
  for (const key of Object.keys(reqFiles)) {
    for (const file of reqFiles[key]) {
      cleanupTempFile(file);
    }
  }
};

// Helper function to save uploaded file
const saveUploadedFile = async (file, userId, type) => {
  if (!file) return null;

  // Defensive validation in case multer's own limits/fileFilter were
  // misconfigured or bypassed (e.g. a different upload path in future).
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File "${file.originalname}" exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`);
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new Error(`File "${file.originalname}" has an unsupported type (${file.mimetype}).`);
  }

  const uploadDir = path.join(__dirname, '../../uploads/applications');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const timestamp = Date.now();
  let safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
  if (!safeName) safeName = 'file';
  safeName = safeName.slice(-100); // cap length, keep extension-end intact
  const filename = `application_${userId}_${type}_${timestamp}_${safeName}`;
  const filepath = path.join(uploadDir, filename);

  // Move file to uploads directory
  fs.renameSync(file.path, filepath);

  return {
    url: `/uploads/applications/${filename}`,
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    uploadedAt: new Date(),
  };
};

/**
 * POST /api/applications
 * Apply for an opportunity with file uploads (CV, cover letter, additional docs)
 * Accepts multipart/form-data (current clients). JSON bodies are still
 * accepted for text-only fields, but cannot be used to satisfy a required
 * document — that always requires an actual uploaded file.
 */
exports.applyForOpportunity = async (req, res) => {
  try {
    console.log('📝 Application request received');
    console.log('📝 Content-Type:', req.headers['content-type']);
    console.log('📝 Body:', JSON.stringify(req.body, null, 2));
    console.log('📝 Files:', req.files ? Object.keys(req.files) : 'No files');

    const isMultipart = !!req.files || !!req.headers['content-type']?.includes('multipart/form-data');

    // Support both JSON and form-data for the text fields
    const opportunityId = req.body.opportunityId;
    const coverLetter = req.body.coverLetter;
    const profileId = req.body.profileId;
    const cvId = req.body.cvId;
    const notes = req.body.notes;

    // Validate required fields
    if (!opportunityId) {
      console.log('Missing opportunityId');
      cleanupAllTempFiles(req.files);
      return res.status(400).json({ error: 'Opportunity ID is required.' });
    }

    console.log('🔍 Looking for opportunity:', opportunityId);
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      console.log('Opportunity not found');
      cleanupAllTempFiles(req.files);
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    if (opportunity.status !== 'published') {
      console.log('Opportunity not published:', opportunity.status);
      cleanupAllTempFiles(req.files);
      return res.status(400).json({ error: 'This opportunity is not available for application.' });
    }

    // ── Required-document enforcement ──────────────────────────────────
    // If the opportunity requires a CV, a JSON-only (no-files) request
    // can never satisfy that — this is exactly the legacy-client failure
    // mode where applications were silently created with no attachments.
    const requiredDocs = opportunity.requiredDocuments || ['cv'];
    const requiresCv = requiredDocs.includes('cv');
    const hasCvFile = !!req.files?.cv;
    const hasExistingCvId = !!cvId;

    if (requiresCv && !hasCvFile && !hasExistingCvId) {
      console.log(' Required CV missing from request (isMultipart:', isMultipart, ')');
      cleanupAllTempFiles(req.files);
      return res.status(400).json({
        error: 'A CV/resume file is required to apply for this opportunity. Please update your app if you do not see an upload option.',
      });
    }

    // Get or create profile - PRIORITIZE finding by userId
    console.log('🔍 Looking for profile for user:', req.user._id);
    let profile = await Profile.findOne({ userId: req.user._id });

    if (!profile && profileId) {
      console.log('🔍 Looking for profile by ID:', profileId);
      profile = await Profile.findOne({ _id: profileId, userId: req.user._id });
    }

    if (!profile) {
      console.log('No profile found');
      cleanupAllTempFiles(req.files);
      return res.status(403).json({ error: 'Please complete your profile before applying.' });
    }

    console.log(' Profile found:', profile._id);

    // Check for existing application
    const existing = await Application.findOne({ profileId: profile._id, opportunityId });
    if (existing) {
      console.log('Already applied');
      cleanupAllTempFiles(req.files);
      return res.status(400).json({ error: 'You have already applied to this opportunity.' });
    }

    // ── Save uploaded files (if any) ───────────────────────────────────
    let manualCvFile = null;
    let coverLetterFile = null;
    let additionalDocs = [];

    try {
      if (req.files?.cv) {
        manualCvFile = await saveUploadedFile(req.files.cv[0], req.user._id, 'cv');
      }
      if (req.files?.coverLetterFile) {
        coverLetterFile = await saveUploadedFile(req.files.coverLetterFile[0], req.user._id, 'coverletter');
      }
      if (req.files?.additionalDocs) {
        for (const file of req.files.additionalDocs) {
          const saved = await saveUploadedFile(file, req.user._id, 'document');
          if (saved) additionalDocs.push(saved);
        }
      }
    } catch (fileError) {
      // A file failed validation (size/type) or failed to move to disk.
      // Don't create a partial application — reject the whole request.
      console.log('File handling error:', fileError.message);
      cleanupAllTempFiles(req.files);
      return res.status(400).json({ error: fileError.message });
    }

    // Compute match score from the matching engine (optional, don't fail if it errors)
    let matchScore = 0;
    let matchBreakdown = { skillScore: 0, experienceScore: 0, collaborativeScore: 0 };
    try {
      const matchResult = await mlService.scoreMatch({ profileId: profile._id, opportunityId });
      if (matchResult.ok) {
        matchScore = matchResult.data.matchScore || 0;
        matchBreakdown = matchResult.data.breakdown || matchBreakdown;
      }
    } catch (mlError) {
      console.log('Match score calculation failed, using defaults:', mlError.message);
    }

    // Prepare application data
    const applicationData = {
      profileId: profile._id,
      opportunityId,
      cvId: cvId || null,
      coverLetter: coverLetter || notes || null,
      matchScore,
      matchBreakdown,
      applicationSource: 'in_app',
      status: 'submitted',
      submittedAt: new Date(),
      isPinned: false,
      pinnedAt: null,
    };

    if (manualCvFile) applicationData.manualCv = manualCvFile;
    if (coverLetterFile) applicationData.coverLetterFile = coverLetterFile;
    if (additionalDocs.length > 0) applicationData.additionalDocuments = additionalDocs;

    // Legacy JSON `attachments` — disabled by default. Flip
    // ALLOW_LEGACY_JSON_ATTACHMENTS to true only if you knowingly still
    // need to support old clients sending file references this way.
    if (ALLOW_LEGACY_JSON_ATTACHMENTS && req.body.attachments && Array.isArray(req.body.attachments)) {
      applicationData.attachments = req.body.attachments;
    }

    console.log('📝 Creating application with data:', {
      profileId: applicationData.profileId,
      opportunityId: applicationData.opportunityId,
      hasCoverLetter: !!applicationData.coverLetter,
      hasManualCv: !!manualCvFile,
    });

    const application = await Application.create(applicationData);
    console.log('Application created:', application._id);

    // Increment application count
    opportunity.applicationCount += 1;
    await opportunity.save();

    // Send notification to employer
    try {
      await notify.create({
        userId: opportunity.postedByUserId,
        type: 'application_update',
        title: `New Application: ${opportunity.title}`,
        content: `${req.user.fullName} applied for "${opportunity.title}" (${Math.round(matchScore)}% match)`,
        metadata: {
          applicationId: application._id,
          opportunityId,
          matchScore,
          applicantName: req.user.fullName,
          applicantId: req.user._id,
        },
      });
    } catch (notifyError) {
      console.log(' Notification failed:', notifyError.message);
    }

    // Also notify via socket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${opportunity.postedByUserId}`).emit('new_application', {
        applicationId: application._id,
        opportunityId,
        opportunityTitle: opportunity.title,
        applicantName: req.user.fullName,
        applicantId: req.user._id,
        matchScore,
        type: 'in_app_application',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: {
        id: application._id,
        status: application.status,
        matchScore: application.matchScore,
        submittedAt: application.submittedAt,
      },
    });
  } catch (error) {
    console.error('Apply error:', error);
    logger.error('Apply error:', error);
    cleanupAllTempFiles(req.files);
    res.status(500).json({ error: 'Failed to submit application: ' + error.message });
  }
};

/**
 * GET /api/applications/mine
 * Get current user's applications with all document information
 */
exports.getMyApplications = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.json({ applications: [] });

    const applications = await Application.find({ profileId: profile._id })
      .populate({
        path: 'opportunityId',
        populate: { path: 'companyId', select: 'name logoUrl' },
      })
      .sort({ isPinned: -1, pinnedAt: -1, submittedAt: -1 });

    // Add document info to each application
    const enrichedApplications = applications.map(app => ({
      ...app.toObject(),
      hasCv: !!(app.manualCv?.url || app.cvId),
      hasCoverLetter: !!(app.coverLetter || app.coverLetterFile?.url),
      hasAdditionalDocs: (app.additionalDocuments?.length > 0) || (app.attachments?.length > 0),
    }));

    res.json({ applications: enrichedApplications });
  } catch (error) {
    logger.error('Get my applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications.' });
  }
};

/**
 * GET /api/applications/:id/documents
 * Get all documents for a specific application
 */
exports.getApplicationDocuments = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('profileId', 'userId')
      .populate('opportunityId', 'title');

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    // Check authorization
    const isOwner = application.profileId.userId.toString() === req.user._id.toString();
    const isEmployer = application.opportunityId.postedByUserId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isEmployer && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const documents = {
      cv: application.manualCv || null,
      coverLetter: application.coverLetterFile || null,
      coverLetterText: application.coverLetter || null,
      additionalDocuments: application.additionalDocuments || [],
      attachments: application.attachments || [], // legacy, read-only
    };

    res.json({ documents });
  } catch (error) {
    logger.error('Get application documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
};

/**
 * GET /api/applications/opportunity/:opportunityId
 * Get applications for an opportunity (employer view)
 */
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
        populate: { path: 'userId', select: 'fullName email avatar' },
      })
      .sort({ matchScore: -1, submittedAt: -1 });

    // Enrich applications with document info
    const enrichedApplications = applications.map(app => ({
      ...app.toObject(),
      hasCv: !!(app.manualCv?.url || app.cvId),
      hasCoverLetter: !!(app.coverLetter || app.coverLetterFile?.url),
      cvUrl: app.manualCv?.url || null,
      coverLetterUrl: app.coverLetterFile?.url || null,
    }));

    res.json({ applications: enrichedApplications });
  } catch (error) {
    logger.error('Get applications for opportunity error:', error);
    res.status(500).json({ error: 'Failed to fetch applications.' });
  }
};

/**
 * PUT /api/applications/:id/status
 * Update application status (employer only)
 */
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
      title: `Application Status Update: ${application.opportunityId.title}`,
      content: `Your application has been ${status.replace(/_/g, ' ')}.`,
      metadata: {
        applicationId: application._id,
        opportunityId: application.opportunityId._id,
        newStatus: status,
      },
    });

    // Socket notification
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${application.profileId.userId}`).emit('application_status_changed', {
        applicationId: application._id,
        status,
        opportunityTitle: application.opportunityId.title,
      });
    }

    res.json({ application });
  } catch (error) {
    logger.error('Update application status error:', error);
    res.status(500).json({ error: 'Failed to update application status.' });
  }
};

/**
 * DELETE /api/applications/:id
 * Withdraw application (worker only)
 */
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
    logger.error('Withdraw application error:', error);
    res.status(500).json({ error: 'Failed to withdraw application.' });
  }
};

/**
 * PUT /api/applications/:id/pin
 * Toggle pin application
 */
exports.togglePinApplication = async (req, res) => {
  try {
    const applicationId = req.params.id;
    const userId = req.user._id;

    const application = await Application.findById(applicationId).populate('profileId');
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    if (application.profileId.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    application.isPinned = !application.isPinned;
    application.pinnedAt = application.isPinned ? new Date() : null;
    await application.save();

    res.json({ success: true, isPinned: application.isPinned });
  } catch (error) {
    console.error('Toggle pin error:', error);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
};