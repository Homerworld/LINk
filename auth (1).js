const Joi = require('joi');
const { error } = require('../utils/response');

const validate = (schema) => (req, res, next) => {
  const { error: err } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (err) {
    const errors = err.details.map(d => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }));
    return error(res, 'Validation failed', 400, errors);
  }
  next();
};

const schemas = {
  sendOtp: Joi.object({
    phone: Joi.string().min(10).max(15).required(),
    purpose: Joi.string().valid('signup', 'login', 'reset').default('signup'),
  }),

  verifyOtp: Joi.object({
    phone: Joi.string().min(10).max(15).required(),
    code: Joi.string().length(6).required(),
    purpose: Joi.string().valid('signup', 'login', 'reset').default('signup'),
  }),

  customerSignup: Joi.object({
    full_name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().optional().allow(''),
    phone: Joi.string().min(10).max(15).required(),
    password: Joi.string().min(8).required(),
  }),

  vendorSignup: Joi.object({
    full_name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().optional().allow(''),
    phone: Joi.string().min(10).max(15).required(),
    password: Joi.string().min(8).required(),
  }),

  login: Joi.object({
    phone: Joi.string().min(10).max(15).required(),
    password: Joi.string().required(),
  }),

  setPin: Joi.object({
    pin: Joi.string().length(4).pattern(/^\d+$/).required(),
  }),

  createOffer: Joi.object({
    vendor_id: Joi.string().uuid().required(),
    service_id: Joi.string().uuid().optional(),
    service_name: Joi.string().max(100).optional(),
    description: Joi.string().max(500).optional(),
    amount: Joi.number().integer().min(100).required(),
  }),

  respondOffer: Joi.object({
    action: Joi.string().valid('accept', 'reject', 'counter').required(),
    counter_amount: Joi.number().integer().min(100).when('action', {
      is: 'counter', then: Joi.required(),
    }),
  }),

  submitEvidence: Joi.object({
    description: Joi.string().max(1000).optional(),
  }),

  raiseDispute: Joi.object({
    issue: Joi.string().valid('never_started', 'incomplete', 'quality', 'no_show', 'other').required(),
    description: Joi.string().max(1000).optional(),
  }),

  ruleDispute: Joi.object({
    ruling: Joi.string().valid('full_refund', 'partial_split', 'full_payment').required(),
    ruling_split: Joi.number().integer().min(1).max(99).when('ruling', {
      is: 'partial_split', then: Joi.required(),
    }),
    ruling_notes: Joi.string().max(500).optional(),
  }),

  reviewKyc: Joi.object({
    action: Joi.string().valid('approve', 'reject', 'request_info').required(),
    reason: Joi.string().max(500).when('action', {
      is: Joi.valid('reject', 'request_info'), then: Joi.required(),
    }),
  }),

  vendorStatus: Joi.object({
    action: Joi.string().valid('suspend', 'ban', 'reinstate').required(),
    reason: Joi.string().max(500).optional(),
  }),

  withdraw: Joi.object({
    amount: Joi.number().integer().min(200000).required(),
    pin: Joi.string().length(4).pattern(/^\d+$/).required(),
  }),

  submitReview: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    review: Joi.string().max(500).optional(),
  }),
};

module.exports = { validate, schemas };
