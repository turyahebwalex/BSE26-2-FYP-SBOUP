const Joi = require('joi');

/**
 * Central validator registry. Each entry exports a Joi schema. The
 * validate() middleware at the bottom picks the right schema by
 * (location, name) and rejects invalid payloads with a 422.
 */

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
  proficiencyLevel: Joi.string()
    .valid('beginner', 'intermediate', 'advanced', 'expert')
    .required(),
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
  applicationMethod: Joi.string().valid('internal', 'external').default('internal'),
  externalLink: Joi.string().uri().allow(''),
  mediaUrls: Joi.array().items(Joi.string().uri()).default([]),
});

// ─── Application ─────────────────────────────────────────────────
const applyForOpportunity = Joi.object({
  opportunityId: Joi.string().hex().length(24).required(),
  profileId: Joi.string().hex().length(24).required(),
  cvId: Joi.string().hex().length(24).allow(null, ''),
  coverLetter: Joi.string().max(3000).allow(''),
  attachments: Joi.array().items(
    Joi.object({
      fileName: Joi.string().required(),
      fileUrl: Joi.string().uri().required(),
      fileType: Joi.string().optional(),
    })
  ).default([]),
});

// ─── Messaging ────────────────────────────────────────────────────
const sendMessage = Joi.object({
  receiverId: Joi.string().hex().length(24).required(),
  content: Joi.string().min(1).max(5000).required(),
  applicationRef: Joi.string().hex().length(24).allow(null, ''),
  attachments: Joi.array().items(
    Joi.object({
      fileName: Joi.string().required(),
      fileUrl: Joi.string().uri().required(),
      fileSize: Joi.number().max(10 * 1024 * 1024),
    })
  ).default([]),
});

// ─── Report ──────────────────────────────────────────────────────
const createReport = Joi.object({
  targetId: Joi.string().hex().length(24).required(),
  targetType: Joi.string().valid('opportunity', 'user', 'message').required(),
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
  targetSkill: Joi.string().max(150).required(),
  opportunityId: Joi.string().hex().length(24).allow(null, ''),
});

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
  sendMessage,
  createReport,
  createCompany,
  generateCV,
  generateLearningPath,
};

/**
 * Middleware: validate(schemaName)
 * Runs req.body through the named Joi schema. On success, req.body
 * is replaced with the stripped + coerced value.
 */
const validate = (schemaName) => (req, res, next) => {
  const schema = schemas[schemaName];
  if (!schema) return next();
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

module.exports = { schemas, validate };
