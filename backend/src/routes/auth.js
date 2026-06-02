const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

router.post('/otp/send', validate(schemas.sendOtp), auth.sendOtp);
router.post('/otp/verify', validate(schemas.verifyOtp), auth.verifyOtp);
router.post('/signup/customer', validate(schemas.customerSignup), auth.customerSignup);
router.post('/signup/vendor', validate(schemas.vendorSignup), auth.vendorSignup);
router.post('/login', validate(schemas.login), auth.login);
router.post('/refresh', auth.refreshToken);
router.post('/pin', authenticate, validate(schemas.setPin), auth.setPin);
router.post('/push-token', authenticate, auth.updatePushToken);
router.get('/me', authenticate, auth.getMe);

module.exports = router;
