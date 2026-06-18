const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/application.controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadAny } = require('../middleware/upload'); 

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads/applications');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${req.user?._id || 'user'}-${uniqueSuffix}-${safeName}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'text/plain'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG, TXT'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } 
});


const uploadFields = upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'coverLetterFile', maxCount: 1 },
  { name: 'additionalDocs', maxCount: 10 }
]);

// ─── Application Routes ─────────────────────────────────────────────────────

// POST - Apply for opportunity (supports file uploads)
router.post(
  '/', 
  authenticate, 
  authorize('skilled_worker'), 
  (req, res, next) => {
    // Check if it's a multipart request (has files)
    if (req.is('multipart/form-data')) {
      uploadFields(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }
        next();
      });
    } else {
      next();
    }
  },
  validate('applyForOpportunity'), 
  ctrl.applyForOpportunity
);

// GET - Get current user's applications
router.get('/mine', authenticate, authorize('skilled_worker'), ctrl.getMyApplications);

// GET - Get all documents for a specific application
router.get('/:id/documents', authenticate, ctrl.getApplicationDocuments);

// GET - Get applications for an opportunity (employer view)
router.get('/opportunity/:opportunityId', authenticate, authorize('employer'), ctrl.getApplicationsForOpportunity);

// PUT - Update application status (employer only)
router.put('/:id/status', authenticate, authorize('employer'), ctrl.updateApplicationStatus);

// PUT - Withdraw application (worker only)
router.put('/:id/withdraw', authenticate, authorize('skilled_worker'), ctrl.withdrawApplication);

// PUT - Pin/Unpin application (worker only)
router.put('/:id/pin', authenticate, authorize('skilled_worker'), ctrl.togglePinApplication);

// ── Attachment upload ─────────────────────────────────────────────────────────
// Workers upload files before submitting an application. Returns a permanent
// server URL that is stored in the application's attachments array.

router.post(
  '/upload-attachment',
  authenticate,
  authorize('skilled_worker'),
  uploadAny.single('file'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    // Move from temp → uploads/applications
    const appDir = path.join(__dirname, '../uploads/applications');
    fs.mkdirSync(appDir, { recursive: true });
    const dest = path.join(appDir, req.file.filename);
    try {
      fs.renameSync(req.file.path, dest);
    } catch {
      try { fs.copyFileSync(req.file.path, dest); fs.unlinkSync(req.file.path); } catch {}
    }

    const fileUrl = `/uploads/applications/${req.file.filename}`;
    // Build a full URL so the Joi validator (which requires uri()) accepts it
    const protocol = req.protocol;
    const host     = req.get('host');
    const fullUrl  = `${protocol}://${host}${fileUrl}`;
    res.json({
      fileName: req.file.originalname,
      fileUrl:  fullUrl,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    });
  }
);

module.exports = router;