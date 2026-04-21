const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Blob storage adapter. Production mode uploads to S3 / Azure Blob;
 * dev mode serves files out of ./uploads/ via a static mount so
 * newcomers don't need cloud credentials to run the stack locally.
 */

const PROVIDER = process.env.STORAGE_PROVIDER || 'local';
const PUBLIC_BASE = process.env.PUBLIC_FILES_URL || 'http://localhost:5000/uploads';

let s3 = null;
if (PROVIDER === 's3' && process.env.AWS_ACCESS_KEY_ID) {
  try {
    const AWS = require('aws-sdk');
    s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'af-south-1',
    });
    logger.info('Storage provider: AWS S3');
  } catch (err) {
    logger.warn('S3 init failed, falling back to local storage');
  }
} else {
  logger.info('Storage provider: local filesystem');
}

/**
 * Upload a file (by local path or Buffer). Returns { url, key }.
 */
const upload = async ({ localPath, key, buffer, contentType }) => {
  if (s3) {
    const bucket = process.env.AWS_S3_BUCKET || 'sboup-uploads';
    const body = buffer || fs.createReadStream(localPath);
    const result = await s3
      .upload({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ACL: 'public-read' })
      .promise();
    return { url: result.Location, key };
  }

  const destDir = path.join(__dirname, '../../uploads', path.dirname(key));
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(__dirname, '../../uploads', key);
  if (buffer) {
    fs.writeFileSync(destPath, buffer);
  } else if (localPath && localPath !== destPath) {
    fs.copyFileSync(localPath, destPath);
  }
  return { url: `${PUBLIC_BASE}/${key}`, key };
};

const remove = async ({ key }) => {
  if (s3) {
    const bucket = process.env.AWS_S3_BUCKET || 'sboup-uploads';
    try {
      await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
    } catch (err) {
      logger.warn('S3 delete failed:', err.message);
    }
    return;
  }
  const absPath = path.join(__dirname, '../../uploads', key);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
};

module.exports = { upload, remove };
