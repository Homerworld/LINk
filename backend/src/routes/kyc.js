// kyc.js
const kycRouter = require('express').Router();
const kycController = require('../controllers/kycController');
const { authenticate, requireVendor } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

kycRouter.use(authenticate, requireVendor);
kycRouter.post('/identity', kycController.submitIdentity);
kycRouter.post('/id-document', upload.single('file'), kycController.uploadIdDocument);
kycRouter.post('/selfie', upload.single('file'), kycController.uploadSelfie);
kycRouter.post('/services', kycController.addServices);
kycRouter.post('/portfolio', upload.array('files', 4), kycController.uploadPortfolio);
kycRouter.post('/location', kycController.updateLocationAvailability);
kycRouter.post('/submit', kycController.submitForReview);
kycRouter.get('/status', kycController.getKycStatus);
kycRouter.post('/suggest-service', kycController.suggestService);

module.exports = kycRouter;
