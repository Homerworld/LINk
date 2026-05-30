const axios = require('axios');
const { query } = require('../config/database');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

// GET /api/kyc/status
exports.getStatus = async (req, res) => {
  try {
    const result = await query(
      `SELECT vp.kyc_status, vp.kyc_submitted_at, vp.kyc_rejection_reason,
        vp.id_type, vp.id_document_url, vp.selfie_url, vp.bvn_verified,
        vp.bank_name, vp.account_number, vp.account_name,
        vp.location_area, vp.location_type, vp.price_min, vp.price_max,
        array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS services,
        COUNT(DISTINCT pi.id) AS image_count
       FROM vendor_profiles vp
       LEFT JOIN vendor_services vs ON vs.vendor_profile_id = vp.id
       LEFT JOIN services s ON s.id = vs.service_id
       LEFT JOIN portfolio_images pi ON pi.vendor_profile_id = vp.id
       WHERE vp.user_id = $1
       GROUP BY vp.id`,
      [req.user.userId]
    );
    if (result.rows.length === 0) return error(res, 'Vendor profile not found', 404);
    return success(res, result.rows[0]);
  } catch (err) {
    return error(res, 'Failed to get KYC status');
  }
};

// POST /api/kyc/identity — BVN + bank account
exports.submitIdentity = async (req, res) => {
  try {
    const { id_type, bvn, bank_code, account_number } = req.body;
    const vendorId = req.user.userId;

    // Verify account with Paystack
    let accountName = null;
    try {
      const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
      if (PAYSTACK_SECRET && !PAYSTACK_SECRET.includes('xxxx')) {
        const res = await axios.get(
          `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
        );
        accountName = res.data.data.account_name;
      } else {
        accountName = 'Account Holder (Dev Mode)';
      }
    } catch (err) {
      return error(res, 'Could not verify bank account. Check the account number and bank.', 400);
    }

    // Get bank name
    let bankName = bank_code;
    try {
      const banksRes = await axios.get('https://api.paystack.co/bank', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      const bank = banksRes.data.data.find((b) => b.code === bank_code);
      if (bank) bankName = bank.name;
    } catch { }

    await query(
      `UPDATE vendor_profiles SET
        id_type = $1, bvn_verified = TRUE,
        bank_code = $2, bank_name = $3, account_number = $4, account_name = $5,
        updated_at = NOW()
       WHERE user_id = $6`,
      [id_type, bank_code, bankName, account_number, accountName, vendorId]
    );

    return success(res, { account_name: accountName, bank_name: bankName }, 'Identity verified');
  } catch (err) {
    return error(res, 'Failed to submit identity');
  }
};

// POST /api/kyc/id-document
exports.uploadIdDocument = async (req, res) => {
  try {
    // In production, upload to S3 via uploadService
    // For now, use filename as placeholder
    const url = req.file ? `https://placeholder.link/${req.file.filename}` : null;
    if (!url) return error(res, 'No file uploaded', 400);

    await query(
      `UPDATE vendor_profiles SET id_document_url = $1, updated_at = NOW() WHERE user_id = $2`,
      [url, req.user.userId]
    );
    return success(res, { url }, 'ID document uploaded');
  } catch (err) {
    return error(res, 'Failed to upload ID document');
  }
};

// POST /api/kyc/selfie
exports.uploadSelfie = async (req, res) => {
  try {
    const url = req.file ? `https://placeholder.link/${req.file.filename}` : null;
    if (!url) return error(res, 'No file uploaded', 400);

    await query(
      `UPDATE vendor_profiles SET selfie_url = $1, updated_at = NOW() WHERE user_id = $2`,
      [url, req.user.userId]
    );
    return success(res, { url }, 'Selfie uploaded');
  } catch (err) {
    return error(res, 'Failed to upload selfie');
  }
};

// POST /api/kyc/services
exports.addServices = async (req, res) => {
  try {
    const { service_ids } = req.body;
    const vendorId = req.user.userId;

    if (!Array.isArray(service_ids) || service_ids.length === 0) {
      return error(res, 'At least one service required', 400);
    }
    if (service_ids.length > 4) {
      return error(res, 'Maximum 4 services allowed', 400);
    }

    const profileResult = await query(
      `SELECT id FROM vendor_profiles WHERE user_id = $1`, [vendorId]
    );
    if (profileResult.rows.length === 0) return error(res, 'Vendor profile not found', 404);

    const profileId = profileResult.rows[0].id;
    await query(`DELETE FROM vendor_services WHERE vendor_profile_id = $1`, [profileId]);

    for (const serviceId of service_ids) {
      await query(
        `INSERT INTO vendor_services (vendor_profile_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [profileId, serviceId]
      );
    }

    return success(res, {}, 'Services updated');
  } catch (err) {
    return error(res, 'Failed to add services');
  }
};

// POST /api/kyc/portfolio
exports.uploadPortfolio = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    if (!req.files || req.files.length === 0) return error(res, 'No files uploaded', 400);

    const profileResult = await query(
      `SELECT id FROM vendor_profiles WHERE user_id = $1`, [vendorId]
    );
    const profileId = profileResult.rows[0].id;

    const existing = await query(
      `SELECT COUNT(*) AS count FROM portfolio_images WHERE vendor_profile_id = $1`, [profileId]
    );
    if (parseInt(existing.rows[0].count) + req.files.length > 4) {
      return error(res, 'Maximum 4 portfolio images allowed', 400);
    }

    const currentMax = await query(
      `SELECT COALESCE(MAX(display_order), -1) AS max_order FROM portfolio_images WHERE vendor_profile_id = $1`,
      [profileId]
    );
    let order = parseInt(currentMax.rows[0].max_order) + 1;

    for (const file of req.files) {
      const url = `https://placeholder.link/${file.filename}`;
      await query(
        `INSERT INTO portfolio_images (vendor_profile_id, image_url, display_order) VALUES ($1, $2, $3)`,
        [profileId, url, order++]
      );
    }

    return success(res, {}, 'Portfolio uploaded');
  } catch (err) {
    return error(res, 'Failed to upload portfolio');
  }
};

// POST /api/kyc/location
exports.updateLocation = async (req, res) => {
  try {
    const { location_type, location_area, latitude, longitude, availability_text, available_days, price_min, price_max, price_negotiable } = req.body;

    await query(
      `UPDATE vendor_profiles SET
        location_type = $1, location_area = $2,
        latitude = $3, longitude = $4,
        availability_text = $5, available_days = $6,
        price_min = $7, price_max = $8, price_negotiable = $9,
        updated_at = NOW()
       WHERE user_id = $10`,
      [location_type, location_area, latitude || null, longitude || null,
       availability_text || null, available_days || [1,2,3,4,5,6],
       price_min || null, price_max || null, price_negotiable !== false, req.user.userId]
    );
    return success(res, {}, 'Location updated');
  } catch (err) {
    return error(res, 'Failed to update location');
  }
};

// POST /api/kyc/submit
exports.submit = async (req, res) => {
  try {
    await query(
      `UPDATE vendor_profiles SET kyc_status = 'under_review', kyc_submitted_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [req.user.userId]
    );
    return success(res, {}, 'KYC submitted for review. You will be notified within 24-48 hours.');
  } catch (err) {
    return error(res, 'Failed to submit KYC');
  }
};
