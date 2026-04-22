const router = require('express').Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later' }
});

router.post('/otp/send', authLimiter, authController.sendOtp);
router.post('/otp/verify', authLimiter, validate(schemas.verifyOtp), authController.verifyOtp);
router.post('/signup/customer', authLimiter, validate(schemas.customerSignup), authController.customerSignup);
router.post('/signup/vendor', authLimiter, validate(schemas.vendorSignup), authController.vendorSignup);
router.post('/login', authLimiter, validate(schemas.login), authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/pin', authenticate, validate(schemas.setPin), authController.setWithdrawalPin);
router.post('/push-token', authenticate, authController.updatePushToken);

module.exports = router;
