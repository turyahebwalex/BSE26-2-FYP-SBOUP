const winston = require('winston');

// Custom format to truncate long strings (like base64 images)
const truncateLongStrings = winston.format((info) => {
  const MAX_STRING_LENGTH = 200; // Maximum length for any string in logs
  const MAX_BASE64_LENGTH = 50;  // Even shorter for base64 data
  
  const truncateValue = (value, key) => {
    if (typeof value === 'string') {
      // Check if it looks like base64 image data
      const isBase64 = value.length > 100 && (
        value.startsWith('/9j/') || // JPEG base64 starts with this
        value.startsWith('iVBOR') || // PNG base64 starts with this
        /^[A-Za-z0-9+/=]+$/.test(value.substring(0, 50)) // Base64 pattern
      );
      
      const maxLen = isBase64 ? MAX_BASE64_LENGTH : MAX_STRING_LENGTH;
      
      if (value.length > maxLen) {
        const preview = value.substring(0, maxLen);
        return `${preview}...[TRUNCATED (${value.length} chars)]`;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(item => truncateValue(item));
    }
    if (value && typeof value === 'object') {
      return truncateObject(value);
    }
    return value;
  };
  
  const truncateObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip logging avatarBase64 entirely if it's too long
      if (key === 'avatarBase64' && typeof value === 'string' && value.length > 100) {
        result[key] = '[BASE64_IMAGE_DATA_SUPPRESSED]';
      } else {
        result[key] = truncateValue(value, key);
      }
    }
    return result;
  };
  
  // Apply truncation to the entire message
  if (info.message && typeof info.message === 'string') {
    // If message is a string that might contain JSON, try to parse it
    try {
      const parsed = JSON.parse(info.message);
      info.message = JSON.stringify(truncateObject(parsed));
    } catch {
      // Not JSON, just truncate as string
      if (info.message.length > 1000) {
        info.message = info.message.substring(0, 1000) + `...[TRUNCATED (${info.message.length} chars)]`;
      }
    }
  } else if (info.message && typeof info.message === 'object') {
    info.message = truncateObject(info.message);
  }
  
  // Also check metadata field
  if (info.metadata && typeof info.metadata === 'object') {
    info.metadata = truncateObject(info.metadata);
  }
  
  return info;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    truncateLongStrings(), // Add our custom truncation formatter
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'sboup-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        truncateLongStrings(), // Also apply to console output
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Helper function to log objects without long strings
logger.safeLog = (message, obj) => {
  if (obj && typeof obj === 'object') {
    const cleanObj = JSON.parse(JSON.stringify(obj, (key, value) => {
      if (key === 'avatarBase64' && typeof value === 'string' && value.length > 100) {
        return '[BASE64_IMAGE_DATA_SUPPRESSED]';
      }
      if (typeof value === 'string' && value.length > 500) {
        return value.substring(0, 500) + `...[TRUNCATED (${value.length} chars)]`;
      }
      return value;
    }));
    logger.info(message, cleanObj);
  } else {
    logger.info(message, obj);
  }
};

module.exports = logger;