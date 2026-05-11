const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

const ALLOWED_TYPES = {
  document: ['.pdf', '.doc', '.docx'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
  all: ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp'],
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, '../uploads/temp')
   // const tempDir = path.join(__dirname, '../../uploads/temp');
    // Ensure the temp directory exists
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// ─── File filter factory ───────────────────────────────────────────────────────

const fileFilter = (allowedTypes) => (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(`File type "${ext}" not allowed. Allowed types: ${allowedTypes.join(', ')}`),
      false
    );
  }
};

// ─── Multer instances ─────────────────────────────────────────────────────────

const uploadDocument = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(ALLOWED_TYPES.document),
});

const uploadImage = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(ALLOWED_TYPES.image),
});

const uploadAny = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(ALLOWED_TYPES.all),
});

// ─── uploadMessageAttachments ─────────────────────────────────────────────────
// This is what the messages route imports. It accepts up to 5 files under the
// field name "attachments" — matching exactly what the React Native frontend
// appends via formData.append('attachments', { uri, type, name }).

const uploadMessageAttachments = uploadAny.array('attachments', 5);

// ─── formatFileInfo ───────────────────────────────────────────────────────────
// Converts a multer file object into the shape stored in the Message model.

const formatFileInfo = (file) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

  // Determine a friendly fileType bucket
  let fileType = 'document';
  if (ALLOWED_TYPES.image.includes(`.${ext}`)) fileType = 'image';

  return {
    fileName: file.originalname,
    // Serve from /uploads/messages — move logic handled in cleanupTempFiles
    fileUrl: `/uploads/messages/${file.filename}`,
    fileSize: file.size,
    fileType,
    mimeType: file.mimetype,
  };
};

// ─── cleanupTempFiles ─────────────────────────────────────────────────────────
// After the controller has saved the message, move files from /temp to
// /uploads/messages so they are permanently accessible.
// If permanent storage fails for a file, log and continue — don't crash.

const cleanupTempFiles = async (files) => {
  if (!files || files.length === 0) return;

  const messagesDir = path.join(__dirname, '../../uploads/messages');
  fs.mkdirSync(messagesDir, { recursive: true });

  for (const file of files) {
    const src = file.path; // absolute path written by multer
    const dest = path.join(messagesDir, file.filename);

    try {
      fs.renameSync(src, dest);
    } catch (err) {
      // renameSync can fail across devices — fall back to copy + delete
      try {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      } catch (copyErr) {
        console.error(`Failed to move temp file ${file.filename}:`, copyErr);
      }
    }
  }
};

// ─── Multer error handler middleware ─────────────────────────────────────────
// Use this in your Express app (app.use) or on individual routes to return
// clean JSON errors instead of the default HTML multer error page.

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 5 attachments.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message && err.message.startsWith('File type')) {
    return res.status(415).json({ error: err.message });
  }
  next(err);
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  uploadDocument,
  uploadImage,
  uploadAny,
  uploadMessageAttachments, // ← was missing; fixes the 422 on file sends
  formatFileInfo,            // ← was missing; used by message.controller.js
  cleanupTempFiles,          // ← was missing; used by message.controller.js
  handleMulterError,         // ← bonus: clean JSON errors for multer failures
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
};