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
// server.js:  uploadsRoot = path.join(__dirname, '..', 'uploads') = /app/uploads
// __dirname here (upload.js) = /app/src/middleware
// So the permanent messages folder is /app/uploads/messages:
//   path.join('/app/src/middleware', '../../uploads/messages') = /app/uploads/messages 

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const messagesDir = path.join(__dirname, '../../uploads/messages');
    if (!fs.existsSync(messagesDir)) {
      fs.mkdirSync(messagesDir, { recursive: true });
    }
    cb(null, messagesDir);
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

const uploadMessageAttachments = uploadAny.array('attachments', 5);

// ─── formatFileInfo ───────────────────────────────────────────────────────────
// fileUrl must match what express.static serves:
//   server.js: app.use('/uploads', express.static('/app/uploads'))
//   so a file at /app/uploads/messages/x.jpg is served at /uploads/messages/x.jpg ✅
const formatFileInfo = (file) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

  let fileType = 'document';
  if (ALLOWED_TYPES.image.includes(`.${ext}`)) fileType = 'image';

  return {
    fileName: file.originalname,
    fileUrl: `/uploads/messages/${file.filename}`, // ✅ matches static serving root
    fileSize: file.size,
    fileType,
    mimeType: file.mimetype,
  };
};

// ─── cleanupTempFiles ─────────────────────────────────────────────────────────
// Files go straight to /app/uploads/messages — no temp folder involved.
// Kept as a no-op so message.controller.js needs zero changes.
const cleanupTempFiles = async (_files) => {
  // No-op: multer writes directly to the permanent folder now.
};

// ─── Multer error handler middleware ──────────────────────────────────────────
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
  if (err?.message?.startsWith('File type')) {
    return res.status(415).json({ error: err.message });
  }
  next(err);
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  uploadDocument,
  uploadImage,
  uploadAny,
  uploadMessageAttachments,
  formatFileInfo,
  cleanupTempFiles,
  handleMulterError,
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
};