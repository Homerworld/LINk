const router = require('express').Router();
const searchController = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');

router.get('/autocomplete', authenticate, searchController.autocomplete);
router.get('/vendors', authenticate, searchController.searchVendors);
router.get('/vendor/:vendorId', authenticate, searchController.getVendorProfile);
router.get('/services', authenticate, searchController.getAllServices);

module.exports = router;
