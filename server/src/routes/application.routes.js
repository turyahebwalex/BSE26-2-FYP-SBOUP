const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../validators');
const ctrl = require('../controllers/application.controller');

router.post('/', authenticate, authorize('skilled_worker'), validate('applyForOpportunity'), ctrl.applyForOpportunity);
router.get('/mine', authenticate, authorize('skilled_worker'), ctrl.getMyApplications);
router.get('/opportunity/:opportunityId', authenticate, authorize('employer'), ctrl.getApplicationsForOpportunity);
router.put('/:id/status', authenticate, authorize('employer'), ctrl.updateApplicationStatus);
router.put('/:id/withdraw', authenticate, authorize('skilled_worker'), ctrl.withdrawApplication);
// 🆕 Pin / unpin an application (only the worker who owns it can toggle)
router.put('/:id/pin', authenticate, authorize('skilled_worker'), ctrl.togglePinApplication);

// ── Attachment upload ─────────────────────────────────────────────────────────
// Workers upload files before submitting an application. Returns a permanent
// server URL that is stored in the application's attachments array.
const { uploadAny } = require('../middleware/upload');
const path = require('path');
const fs   = require('fs');

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