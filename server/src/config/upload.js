// src/config/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

const ALLOWED_TYPES = {
  document: ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.ppt', '.pptx'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a'],
  video: ['.mp4', '.mov', '.avi', '.mkv'],
  all: ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.ppt', '.pptx', 
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
        '.mp3', '.wav', '.ogg', '.m4a',
        '.mp4', '.mov', '.avi', '.mkv'],
};

// Create upload directories if they don't exist
const createUploadDirs = () => {
  const dirs = [
    path.join(__dirname, '../../uploads/temp'),
    path.join(__dirname, '../../uploads/messages'),
    path.join(__dirname, '../../uploads/avatars'),
    path.join(__dirname, '../../uploads/documents')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createUploadDirs();

// Dynamic storage based on subfolder
const getStorage = (subfolder = 'temp') => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, '../../uploads', subfolder);
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const sanitizedName = file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .substring(0, 50);
      cb(null, `${uuidv4()}_${sanitizedName}${ext}`);
    },
  });
};

// Determine file type category
const getFileCategory = (mimetype, filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ALLOWED_TYPES.image.includes(ext)) return 'image';
  if (ALLOWED_TYPES.document.includes(ext)) return 'document';
  if (ALLOWED_TYPES.audio.includes(ext)) return 'audio';
  if (ALLOWED_TYPES.video.includes(ext)) return 'video';
  return 'other';
};

// Get file icon based on type
const getFileIcon = (fileType) => {
  const icons = {
    image: '🖼️',
    document: '📄',
    pdf: '📑',
    word: '📝',
    excel: '📊',
    powerpoint: '📽️',
    audio: '🎵',
    video: '🎬',
    other: '📎'
  };
  return icons[fileType] || icons.other;
};

// Enhanced file filter with better error messages
const fileFilter = (allowedTypes) => (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not allowed. Allowed: ${allowedTypes.join(', ')}`), false);
  }
};

// Multer configurations for different use cases
const uploadDocument = multer({
  storage: getStorage('documents'),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: fileFilter(ALLOWED_TYPES.document),
});

const uploadImage = multer({
  storage: getStorage('messages'),
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter: fileFilter(ALLOWED_TYPES.image),
});

const uploadAny = multer({
  storage: getStorage('messages'),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: fileFilter(ALLOWED_TYPES.all),
});

// Specialized for message attachments (supports multiple files)
const uploadMessageAttachments = multer({
  storage: getStorage('messages'),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: fileFilter(ALLOWED_TYPES.all),
}).array('attachments', 5);

// For single file upload (avatar, etc.)
const uploadSingleFile = (fieldName) => multer({
  storage: getStorage('temp'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(ALLOWED_TYPES.all),
}).single(fieldName);

// Helper function to format file info for response
const formatFileInfo = (file, customPath = null) => {
  const fileType = getFileCategory(file.mimetype, file.originalname);
  const ext = path.extname(file.originalname).toLowerCase();
  
  let fileSubType = 'other';
  if (ext === '.pdf') fileSubType = 'pdf';
  if (ext === '.doc' || ext === '.docx') fileSubType = 'word';
  if (ext === '.xls' || ext === '.xlsx') fileSubType = 'excel';
  if (ext === '.ppt' || ext === '.pptx') fileSubType = 'powerpoint';
  
  return {
    fileName: file.originalname,
    fileUrl: customPath || `/uploads/messages/${file.filename}`,
    fileSize: file.size,
    fileType: fileType,
    fileSubType: fileSubType,
    mimeType: file.mimetype,
    icon: getFileIcon(fileSubType),
    fileId: uuidv4(),
  };
};

// Clean up temporary files
const cleanupTempFiles = async (files) => {
  if (!files || files.length === 0) return;
  const tempDir = path.join(__dirname, '../../uploads/temp');
  for (const file of files) {
    const filePath = path.join(tempDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    }
  }
};

// Generate file preview URL (for images)
const getFilePreviewUrl = (fileUrl, fileType) => {
  if (fileType === 'image') return fileUrl;
  return null;
};

module.exports = { 
  uploadDocument, 
  uploadImage, 
  uploadAny,
  uploadMessageAttachments,
  uploadSingleFile,
  formatFileInfo,
  cleanupTempFiles,
  getFileCategory,
  getFileIcon,
  getFilePreviewUrl,
  ALLOWED_TYPES,
  MAX_FILE_SIZE
};