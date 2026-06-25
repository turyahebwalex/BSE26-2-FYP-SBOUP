const Joi = require('joi');

// ─── Auth ─────────────────────────────────────────────────────────
const register = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  fullName: Joi.string().min(2).max(100).required(),
  phoneNumber: Joi.string().max(20).allow('', null),
  role: Joi.string().valid('skilled_worker', 'employer').default('skilled_worker'),
  companyName: Joi.string().max(200).allow('', null),
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const forgotPassword = Joi.object({
  email: Joi.string().email().required(),
});

const resetPassword = Joi.object({
  password: Joi.string().min(8).max(128).required(),
});

// ─── Profile ──────────────────────────────────────────────────────
const createProfile = Joi.object({
  title: Joi.string().max(100).required(),
  bio: Joi.string().max(1000).allow(''),
  location: Joi.string().max(100).allow(''),
  visibility: Joi.string().valid('public', 'private').default('public'),
});

const addProfileSkill = Joi.object({
  skillId: Joi.string().hex().length(24).required(),
  proficiencyLevel: Joi.string().valid('beginner', 'intermediate', 'advanced', 'expert').required(),
  classification: Joi.string().valid('primary', 'secondary').default('primary'),
});

const addExperience = Joi.object({
  jobTitle: Joi.string().max(100).required(),
  companyName: Joi.string().max(150).allow(''),
  category: Joi.string().max(50).required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().allow(null),
  description: Joi.string().max(2000).allow(''),
});

const addEducation = Joi.object({
  institution: Joi.string().max(200).required(),
  qualification: Joi.string().max(150).required(),
  fieldOfStudy: Joi.string().max(100).allow(''),
  startYear: Joi.number().integer().min(1950).max(2100).required(),
  endYear: Joi.number().integer().min(1950).max(2100).allow(null),
});

// ─── Opportunity ─────────────────────────────────────────────────
const createOpportunity = Joi.object({
  title: Joi.string().max(200).required(),
  category: Joi.string().valid('formal', 'contract', 'freelance', 'apprenticeship').required(),
  requiredSkills: Joi.array().items(Joi.string().hex().length(24)).default([]),
  description: Joi.string().min(20).max(5000).required(),
  location: Joi.string().max(200).required(),
  companyId: Joi.string().hex().length(24).allow(null, ''),
  compensationRange: Joi.object({
    min: Joi.number().min(0),
    max: Joi.number().min(0),
    currency: Joi.string().default('UGX'),
    period: Joi.string().valid('hourly', 'daily', 'weekly', 'monthly', 'project'),
  }).optional(),
  deadline: Joi.date().greater('now').required(),
  isRemote: Joi.boolean().default(false),
  experienceLevel: Joi.string().valid('entry', 'mid', 'senior', 'any').default('any'),
  schedule: Joi.string().max(100).allow(''),
  
  applicationMethods: Joi.array()
    .items(Joi.string().valid('in_app', 'message', 'external_link'))
    .default(['in_app']),
  externalApplyUrl: Joi.string().allow('', null),
  messageInstructions: Joi.string().max(1000).allow('', null),
  requiredDocuments: Joi.array()
    .items(Joi.string().valid('cv', 'cover_letter', 'portfolio', 'certificates', 'references'))
    .default([]),
  customQuestions: Joi.array().items(
    Joi.object({
      question: Joi.string().required(),
      type: Joi.string().valid('text', 'textarea', 'file', 'select').default('textarea'),
      required: Joi.boolean().default(false),
      options: Joi.array().items(Joi.string()),
      maxLength: Joi.number().default(500),
    })
  ).default([]),
  
  applicationMethod: Joi.string().valid('internal', 'external').default('internal'),
  externalLink: Joi.string().uri().allow(''),
  mediaUrls: Joi.array().items(Joi.string().uri()).default([]),
}).custom((value, helpers) => {
  // If employer selected external_link as an application method, ensure an external URL is provided
  try {
    if (Array.isArray(value.applicationMethods) && value.applicationMethods.includes('external_link')) {
      const url = value.externalApplyUrl || value.externalLink || '';
      if (!String(url).trim()) {
        return helpers.message('externalApplyUrl is required when applicationMethods includes external_link');
      }
    }
  } catch (err) {
    // ignore and let other validation handle it
  }
  return value;
}, 'Application Creation Validation');

const applyForOpportunity = Joi.object({
  opportunityId: Joi.string().hex().length(24).required(),
  profileId: Joi.string().hex().length(24).optional(),
  cvId: Joi.string().hex().length(24).allow(null, ''),
  coverLetter: Joi.string().max(5000).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
  attachments: Joi.array().items(
    Joi.object({
      fileName: Joi.string().required(),
      fileUrl: Joi.string().uri().required(),
      fileType: Joi.string().optional(),
    })
  ).default([]),
}).custom((value, helpers) => {
  return value;
}, 'Application Content Validation');

const applyViaMessage = Joi.object({
  opportunityId: Joi.string().hex().length(24).required(),
  message: Joi.string().min(10).max(2000).required(),
  conversationId: Joi.string().optional(),
});

const getApplicationOptions = Joi.object({
  opportunityId: Joi.string().hex().length(24).required(),
});

const externalUrlRequest = Joi.object({
  opportunityId: Joi.string().hex().length(24).required(),
});
// ─── Messaging (SIMPLIFIED - validation handled by controller) ─────────────────
const sendMessage = Joi.object({
  receiverId: Joi.string().hex().length(24).required(),
  content: Joi.string().max(5000).allow('', null).optional(),
  applicationRef: Joi.string().hex().length(24).allow(null, ''),
  tempId: Joi.string().allow(null, ''),
  // attachments validation removed - handled by multer and controller
});

const markMessages = Joi.object({
  messageIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
});

const typingIndicator = Joi.object({
  receiverId: Joi.string().hex().length(24).required(),
  isTyping: Joi.boolean().required(),
  conversationId: Joi.string().hex().length(24).optional(),
});

const getConversation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

const deleteMessages = Joi.object({
  messageIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
});

const updateOnlineStatus = Joi.object({
  isOnline: Joi.boolean().required(),
  socketId: Joi.string().optional(),
});

const updateMessagingPreferences = Joi.object({
  emailNotifications: Joi.boolean(),
  pushNotifications: Joi.boolean(),
  soundEnabled: Joi.boolean(),
  readReceipts: Joi.boolean(),
});

const searchUsers = Joi.object({
  query: Joi.string().min(2).max(100).required(),
});

const blockUser = Joi.object({
  userId: Joi.string().hex().length(24).required(),
});

// ─── Report ──────────────────────────────────────────────────────
const createReport = Joi.object({
  targetId: Joi.string().hex().length(24).required(),
  targetType: Joi.string().valid('opportunity', 'user', 'message', 'company').required(),
  reason: Joi.string().valid(
    'fraudulent_scam',
    'spam',
    'inappropriate_content',
    'fake_credentials',
    'payment_request',
    'other'
  ).required(),
  details: Joi.string().max(2000).allow(''),
});

// ─── Company ─────────────────────────────────────────────────────
const createCompany = Joi.object({
  name: Joi.string().max(200).required(),
  registrationNumber: Joi.string().max(100).allow(''),
  industry: Joi.string().max(100).allow(''),
  description: Joi.string().max(2000).allow(''),
  website: Joi.string().uri().allow(''),
  logoUrl: Joi.string().uri().allow(''),
  location: Joi.string().max(200).allow(''),
  contactEmail: Joi.string().email().allow(''),
  contactPhone: Joi.string().max(20).allow(''),
});

// ─── CV ──────────────────────────────────────────────────────────
const generateCV = Joi.object({
  templateType: Joi.string()
    .valid('chronological', 'skills_based', 'portfolio_focused')
    .default('chronological'),
  opportunityId: Joi.string().hex().length(24).allow(null, ''),
  description: Joi.string().max(500).allow(''),
  selectedData: Joi.object().unknown(true).optional(),
});

// ─── Learning ────────────────────────────────────────────────────
const generateLearningPath = Joi.object({
  targetSkill: Joi.string().max(150).allow(null, ''),
  opportunityId: Joi.string().hex().length(24).allow(null, ''),
})
  .or('targetSkill', 'opportunityId')
  .messages({
    'object.missing': 'Provide either targetSkill or opportunityId.',
  });

const analyseSkillGaps = Joi.object({
  opportunityId: Joi.string().hex().length(24).required(),
});

const autoSuggestLearning = Joi.object({
  max: Joi.number().integer().min(1).max(5).default(3),
  force: Joi.boolean().default(false),
});

// Combine all schemas into an object
const schemas = {
  register,
  login,
  forgotPassword,
  resetPassword,
  createProfile,
  addProfileSkill,
  addExperience,
  addEducation,
  createOpportunity,
  applyForOpportunity,
  applyViaMessage,
  getApplicationOptions,
  externalUrlRequest,
  sendMessage,
  markMessages,
  typingIndicator,
  getConversation,
  deleteMessages,
  updateOnlineStatus,
  updateMessagingPreferences,
  searchUsers,
  blockUser,
  createReport,
  createCompany,
  generateCV,
  generateLearningPath,
  analyseSkillGaps,
  autoSuggestLearning,
};

/**
 * Middleware: validate(schemaName)
 * Runs req.body through the named Joi schema.
 */
const validate = (schemaName) => (req, res, next) => {
  const schema = schemas[schemaName];
  if (!schema) {
    return next();
  }
  const { error, value } = schema.validate(req.body, {
    stripUnknown: true,
    abortEarly: false,
  });
  if (error) {
    return res.status(422).json({
      error: 'Validation failed',
      details: error.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
    });
  }
  req.body = value;
  next();
};

/**
 * Middleware: validateQuery(schemaName)
 * Validates query parameters (for GET requests)
 */
const validateQuery = (schemaName) => (req, res, next) => {
  const schema = schemas[schemaName];
  if (!schema) {
    return next();
  }
  const { error, value } = schema.validate(req.query, {
    stripUnknown: true,
    abortEarly: false,
  });
  if (error) {
    return res.status(422).json({
      error: 'Invalid query parameters',
      details: error.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
    });
  }
  req.query = value;
  next();
};

module.exports = { schemas, validate, validateQuery };