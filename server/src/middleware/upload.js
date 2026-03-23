const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

const ALLOWED_TYPES = {
  document: ['.pdf', '.doc', '.docx'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
  all: ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp'],
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/temp'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (allowedTypes) => (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not allowed. Allowed: ${allowedTypes.join(', ')}`), false);
  }
};

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

module.exports = { uploadDocument, uploadImage, uploadAny };
