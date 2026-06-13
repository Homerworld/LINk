const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const auth = require('../controllers/authController');
const search = require('../controllers/searchController');
const offers = require('../controllers/offerController');
const payments = require('../controllers/paymentController');
const jobs = require('../controllers/jobController');
const wallet = require('../controllers/walletController');
const kyc = require('../controllers/kycController');
const admin = require('../controllers/adminController');

// ── Auth ──────────────────────────────────────────────────────────
const authRouter = express.Router();
authRouter.post('/otp/send', auth.sendOtp);
authRouter.post('/otp/verify', auth.verifyOtp);
authRouter.post('/signup/customer', auth.customerSignup);
authRouter.post('/signup/vendor', auth.vendorSignup);
authRouter.post('/login', auth.login);
authRouter.post('/refresh', auth.refresh);
authRouter.post('/pin', authenticate, auth.setPin);
authRouter.post('/push-token', authenticate, auth.updatePushToken);
authRouter.get('/me', authenticate, auth.getMe);

// ── Search ────────────────────────────────────────────────────────
const searchRouter = express.Router();
searchRouter.get('/services', search.getServices);
searchRouter.get('/autocomplete', search.autocomplete);
searchRouter.get('/vendors', search.searchVendors);
searchRouter.get('/vendor/:id', search.getVendorProfile);

// ── Offers ────────────────────────────────────────────────────────
const offerRouter = express.Router();
offerRouter.use(authenticate);
offerRouter.post('/', offers.createOffer);
offerRouter.get('/mine', offers.getMyOffers);
offerRouter.get('/:id', offers.getOffer);
offerRouter.post('/:id/respond', offers.respondToOffer);

// ── Payments ──────────────────────────────────────────────────────
const paymentRouter = express.Router();
paymentRouter.post('/webhook', express.raw({ type: 'application/json' }), payments.webhook);
paymentRouter.use(authenticate);
paymentRouter.post('/initiate', payments.initiatePayment);
paymentRouter.get('/banks', payments.getBanks);
paymentRouter.get('/verify/:reference', payments.verifyPayment);
paymentRouter.post('/dev-confirm/:reference', payments.devConfirm);

// ── Jobs ──────────────────────────────────────────────────────────
const jobRouter = express.Router();
jobRouter.use(authenticate);
jobRouter.get('/', jobs.getMyJobs);
jobRouter.get('/:id', jobs.getJob);
jobRouter.post('/:id/complete', jobs.markComplete);
jobRouter.post('/:id/confirm', jobs.confirmJob);
jobRouter.post('/:id/dispute', jobs.raiseDispute);
jobRouter.post('/:id/review', jobs.submitReview);

// ── Wallet ────────────────────────────────────────────────────────
const walletRouter = express.Router();
walletRouter.use(authenticate, requireRole('vendor'));
walletRouter.get('/', wallet.getWallet);
walletRouter.get('/transactions', wallet.getTransactions);
walletRouter.post('/withdraw', wallet.withdraw);

// ── KYC ───────────────────────────────────────────────────────────
const kycRouter = express.Router();
kycRouter.use(authenticate, requireRole('vendor'));
kycRouter.get('/status', kyc.getStatus);
kycRouter.post('/identity', kyc.submitIdentity);
kycRouter.post('/services', kyc.addServices);
kycRouter.post('/location', kyc.updateLocation);
kycRouter.post('/submit', kyc.submit);

// ── Admin ─────────────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(authenticate, requireRole('admin'));
adminRouter.get('/dashboard', admin.getDashboard);
adminRouter.get('/kyc', admin.getKycQueue);
adminRouter.post('/kyc/:id/review', admin.reviewKyc);
adminRouter.get('/disputes', admin.getDisputes);
adminRouter.post('/disputes/:id/rule', admin.ruleDispute);
adminRouter.get('/vendors', admin.getVendors);
adminRouter.post('/vendors/:id/status', admin.updateVendorStatus);

module.exports = { authRouter, searchRouter, offerRouter, paymentRouter, jobRouter, walletRouter, kycRouter, adminRouter };
