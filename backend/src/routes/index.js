const express = require('express');
const { authenticate, requireCustomer, requireVendor, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Offers ────────────────────────────────────────────────────────
const offerController = require('../controllers/offerController');
const offersRouter = express.Router();
offersRouter.post('/', authenticate, requireCustomer, validate(schemas.createOffer), offerController.createOffer);
offersRouter.post('/:offerId/respond', authenticate, requireVendor, offerController.respondToOffer);
offersRouter.post('/:offerId/accept', authenticate, requireCustomer, offerController.acceptCounter);
offersRouter.get('/mine', authenticate, requireVendor, offerController.getVendorOffers);
offersRouter.get('/job/:jobId', authenticate, offerController.getNegotiationThread);

// ── Payments ──────────────────────────────────────────────────────
const paymentController = require('../controllers/paymentController');
const paymentsRouter = express.Router();
paymentsRouter.post('/initiate', authenticate, requireCustomer, validate(schemas.initiatePayment), paymentController.initiatePayment);
paymentsRouter.post('/webhook', express.raw({ type: 'application/json' }), paymentController.paystackWebhook);
paymentsRouter.get('/verify/:reference', authenticate, paymentController.verifyPayment);
paymentsRouter.get('/banks', authenticate, paymentController.getBanks);

// ── Jobs ──────────────────────────────────────────────────────────
const jobController = require('../controllers/jobController');
const jobsRouter = express.Router();
jobsRouter.get('/', authenticate, jobController.getMyJobs);
jobsRouter.get('/:jobId', authenticate, jobController.getJob);
jobsRouter.post('/:jobId/complete', authenticate, requireVendor, jobController.markComplete);
jobsRouter.post('/:jobId/confirm', authenticate, requireCustomer, jobController.confirmComplete);
jobsRouter.post('/review', authenticate, requireCustomer, validate(schemas.createReview), jobController.submitReview);

// ── Vendor wallet ─────────────────────────────────────────────────
const walletController = require('../controllers/walletController');
const walletRouter = express.Router();
walletRouter.get('/', authenticate, requireVendor, walletController.getWallet);
walletRouter.post('/withdraw', authenticate, requireVendor, validate(schemas.withdrawal), walletController.withdraw);
walletRouter.get('/transactions', authenticate, requireVendor, walletController.getTransactions);

// ── Disputes ──────────────────────────────────────────────────────
const disputeController = require('../controllers/disputeController');
const disputesRouter = express.Router();
disputesRouter.post('/', authenticate, requireCustomer, validate(schemas.createDispute), disputeController.raiseDispute);
disputesRouter.post('/:disputeId/evidence', authenticate, upload.array('files', 5), disputeController.submitEvidence);
disputesRouter.get('/:disputeId', authenticate, disputeController.getDispute);

// ── Notifications ─────────────────────────────────────────────────
const notificationService = require('../services/notificationService');
const notifRouter = express.Router();
notifRouter.get('/', authenticate, async (req, res) => {
  const notifications = await notificationService.getUserNotifications(req.user.id, req.query.page);
  const unread = await notificationService.getUnreadCount(req.user.id);
  res.json({ success: true, data: { notifications, unread_count: unread } });
});
notifRouter.post('/read', authenticate, async (req, res) => {
  await notificationService.markRead(req.user.id, req.body.notification_ids);
  res.json({ success: true, message: 'Marked as read' });
});

// ── Admin ─────────────────────────────────────────────────────────
const adminController = require('../controllers/adminController');
const adminRouter = express.Router();
adminRouter.use(authenticate, requireAdmin);
adminRouter.get('/dashboard', adminController.getDashboard);
adminRouter.get('/kyc', adminController.getKycQueue);
adminRouter.post('/kyc/:vendorId/review', adminController.reviewKyc);
adminRouter.get('/disputes', adminController.getDisputeQueue);
adminRouter.post('/disputes/:disputeId/rule', validate(schemas.disputeRuling), adminController.ruleDispute);
adminRouter.get('/vendors', adminController.getVendors);
adminRouter.post('/vendors/:vendorId/status', adminController.updateVendorStatus);
adminRouter.get('/metrics', adminController.getMetrics);
adminRouter.get('/services/pending', adminController.getPendingServices);
adminRouter.post('/services/:serviceId', adminController.approveService);

module.exports = { offersRouter, paymentsRouter, jobsRouter, walletRouter, disputesRouter, notifRouter, adminRouter };
