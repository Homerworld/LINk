const Joi = require('joi');
const { validationError } = require('../utils/response');

const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
  if (error) {
    const errors = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
    return validationError(res, errors);
  }
  req[source] = value;
  next();
};

// ── Auth schemas ──────────────────────────────────────────────────

const customerSignup = Joi.object({
  full_name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().lowercase().required(),
  phone: Joi.string().pattern(/^(\+234|0)[789][01]\d{8}$/).required().messages({
    'string.pattern.base': 'Please enter a valid Nigerian phone number'
  }),
  password: Joi.string().min(8).required(),
});

const vendorSignup = Joi.object({
  full_name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().lowercase().required(),
  phone: Joi.string().pattern(/^(\+234|0)[789][01]\d{8}$/).required(),
  password: Joi.string().min(8).required(),
  business_name: Joi.string().max(255).optional(),
});

const login = Joi.object({
  phone: Joi.string().required(),
  password: Joi.string().required(),
});

const verifyOtp = Joi.object({
  phone: Joi.string().required(),
  code: Joi.string().length(6).required(),
  purpose: Joi.string().valid('signup', 'login', 'withdrawal').required(),
});

const setPin = Joi.object({
  pin: Joi.string().length(4).pattern(/^\d+$/).required(),
  confirm_pin: Joi.string().valid(Joi.ref('pin')).required().messages({
    'any.only': 'PINs do not match'
  }),
});

// ── Offer schemas ─────────────────────────────────────────────────

const createOffer = Joi.object({
  vendor_id: Joi.string().uuid().required(),
  service_id: Joi.string().uuid().required(),
  amount: Joi.number().integer().min(10000).required(), // min ₦100 in kobo
  description: Joi.string().max(500).optional(),
  job_location: Joi.string().max(255).optional(),
  scheduled_at: Joi.date().iso().optional(),
});

const counterOffer = Joi.object({
  amount: Joi.number().integer().min(10000).required(),
  reason: Joi.string().max(255).optional(),
});

// ── Payment schemas ───────────────────────────────────────────────

const initiatePayment = Joi.object({
  job_id: Joi.string().uuid().required(),
  method: Joi.string().valid('card', 'bank_transfer').required(),
});

// ── Withdrawal schemas ────────────────────────────────────────────

const withdrawal = Joi.object({
  amount: Joi.number().integer().min(200000).required(), // min ₦2000 in kobo
  pin: Joi.string().length(4).pattern(/^\d+$/).required(),
});

// ── KYC schemas ───────────────────────────────────────────────────

const kycIdentity = Joi.object({
  id_type: Joi.string().valid('nin', 'voters_card', 'passport', 'drivers_licence').required(),
  bvn: Joi.string().length(11).pattern(/^\d+$/).required(),
  bank_code: Joi.string().required(),
  account_number: Joi.string().length(10).pattern(/^\d+$/).required(),
});

// ── Dispute schemas ───────────────────────────────────────────────

const createDispute = Joi.object({
  job_id: Joi.string().uuid().required(),
  issue: Joi.string().valid('never_started', 'incomplete', 'quality', 'no_show').required(),
});

const disputeRuling = Joi.object({
  ruling: Joi.string().valid('full_refund', 'full_payment', 'partial_split').required(),
  ruling_split: Joi.when('ruling', {
    is: 'partial_split',
    then: Joi.number().integer().min(1).max(99).required(),
    otherwise: Joi.optional()
  }),
  ruling_notes: Joi.string().max(1000).optional(),
});

// ── Review schemas ────────────────────────────────────────────────

const createReview = Joi.object({
  job_id: Joi.string().uuid().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(500).optional(),
});

module.exports = {
  validate,
  schemas: {
    customerSignup, vendorSignup, login, verifyOtp, setPin,
    createOffer, counterOffer,
    initiatePayment,
    withdrawal,
    kycIdentity,
    createDispute, disputeRuling,
    createReview,
  }
};
