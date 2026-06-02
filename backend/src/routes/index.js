const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// Controllers
const search = require('../controllers/searchController');
const offers = require('../controllers/offerController');
const payments = require('../controllers/paymentController');
const jobs = require('../controllers/jobController');
const wallet = require('../controllers/walletController');
const kyc = require('../controllers/kycController');
const admin = require('../controllers/adminController');

// ── Search routes ─────────────────────────────────────────────────
const searchRouter = express.Router();
searchRouter.get('/vendors', search.searchVendors);
searchRouter.get('/autocomplete', search.autocomplete);
searchRouter.get('/vendor/:id', search.getVendorProfile);
searchRouter.get('/services', search.getServices);

// ── Offer routes ──────────────────────────────────────────────────
const offerRouter = express.Router();
offerRouter.use(authenticate);
offerRouter.post('/', validate(schemas.createOffer), offers.createOffer);
offerRouter.get('/mine', offers.getMyOffers);
offerRouter.get('/:id', offers.getOffer);
offerRouter.post('/:id/respond', validate(schemas.respondOffer), offers.respondToOffer);

// ── Payment routes ────────────────────────────────────────────────
const paymentRouter = express.Router();
paymentRouter.post('/webhook', express.raw({ type: 'application/json' }), payments.webhook);
paymentRouter.use(authenticate);
paymentRouter.post('/initiate', payments.initiatePayment);
paymentRouter.get('/verify/:reference', payments.verifyPayment);
paymentRouter.get('/banks', payments.getBanks);
paymentRouter.post('/dev-confirm/:reference', payments.devConfirm);

// ── Job routes ────────────────────────────────────────────────────
const jobRouter = express.Router();
jobRouter.use(authenticate);
jobRouter.get('/', jobs.getMyJobs);
jobRouter.get('/:id', jobs.getJob);
jobRouter.post('/:id/complete', jobs.markComplete);
jobRouter.post('/:id/confirm', jobs.confirmJob);
jobRouter.post('/:id/dispute', validate(schemas.raiseDispute), jobs.raiseDispute);
jobRouter.post('/:id/review', validate(schemas.submitReview), jobs.submitReview);

// ── Wallet routes ─────────────────────────────────────────────────
const walletRouter = express.Router();
walletRouter.use(authenticate, requireRole('vendor'));
walletRouter.get('/', wallet.getWallet);
walletRouter.get('/transactions', wallet.getTransactions);
walletRouter.post('/withdraw', validate(schemas.withdraw), wallet.withdraw);

// ── KYC routes ────────────────────────────────────────────────────
const kycRouter = express.Router();
kycRouter.use(authenticate, requireRole('vendor'));
kycRouter.get('/status', kyc.getStatus);
kycRouter.post('/identity', kyc.submitIdentity);
kycRouter.post('/id-document', upload.single('file'), kyc.uploadIdDocument);
kycRouter.post('/selfie', upload.single('file'), kyc.uploadSelfie);
kycRouter.post('/services', kyc.addServices);
kycRouter.post('/portfolio', upload.array('files', 4), kyc.uploadPortfolio);
kycRouter.post('/location', kyc.updateLocation);
kycRouter.post('/submit', kyc.submit);

// ── Admin routes ──────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(authenticate, requireRole('admin'));
adminRouter.get('/dashboard', admin.getDashboard);
adminRouter.get('/metrics', admin.getMetrics);
adminRouter.get('/kyc', admin.getKycQueue);
adminRouter.post('/kyc/:id/review', validate(schemas.reviewKyc), admin.reviewKyc);
adminRouter.get('/disputes', admin.getDisputes);
adminRouter.post('/disputes/:id/rule', validate(schemas.ruleDispute), admin.ruleDispute);
adminRouter.get('/vendors', admin.getVendors);
adminRouter.post('/vendors/:id/status', validate(schemas.vendorStatus), admin.updateVendorStatus);

module.exports = { searchRouter, offerRouter, paymentRouter, jobRouter, walletRouter, kycRouter, adminRouter };
