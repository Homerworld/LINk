const { query, getClient } = require('../config/database');
const { success, error, notFound } = require('../utils/response');
const uploadService = require('../services/uploadService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

// ── Submit KYC Identity ───────────────────────────────────────────
exports.submitIdentity = async (req, res) => {
  try {
    const { id_type, bvn, bank_code, account_number } = req.body;
    const userId = req.user.id;

    // Resolve account name via Paystack
    let account_name = null;
    try {
      const paystackService = require('../services/paystackService');
      const acct = await paystackService.resolveAccount(account_number, bank_code);
      account_name = acct.account_name;
    } catch (e) {
      return error(res, 'Could not verify bank account. Check account number and bank.', 400);
    }

    const vendorResult = await query(
      'SELECT id FROM vendor_profiles WHERE user_id = $1',
      [userId]
    );
    if (!vendorResult.rows[0]) return notFound(res, 'Vendor profile not found');
    const vendorId = vendorResult.rows[0].id;

    await query(
      `INSERT INTO kyc_documents (vendor_id, id_type, bvn, bank_code, account_number, account_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (vendor_id) DO UPDATE SET
         id_type = $2, bvn = $3, bank_code = $4,
         account_number = $5, account_name = $6, updated_at = NOW()`,
      [vendorId, id_type, bvn, bank_code, account_number, account_name]
    );

    return success(res, { account_name }, 'Identity details saved');
  } catch (err) {
    logger.error('Submit identity error', err);
    return error(res, 'Failed to save identity details');
  }
};

// ── Upload ID Document ────────────────────────────────────────────
exports.uploadIdDocument = async (req, res) => {
  try {
    if (!req.file) return error(res, 'No file uploaded', 400);

    const url = await uploadService.uploadKycDocument(req.file, req.user.id, 'id_document');

    const vendorResult = await query(
      'SELECT id FROM vendor_profiles WHERE user_id = $1',
      [req.user.id]
    );
    const vendorId = vendorResult.rows[0].id;

    await query(
      `UPDATE kyc_documents SET id_document_url = $1, updated_at = NOW()
       WHERE vendor_id = $2`,
      [url, vendorId]
    );

    return success(res, { url }, 'ID document uploaded');
  } catch (err) {
    logger.error('Upload ID error', err);
    return error(res, 'Failed to upload ID document');
  }
};

// ── Upload Selfie ─────────────────────────────────────────────────
exports.uploadSelfie = async (req, res) => {
  try {
    if (!req.file) return error(res, 'No file uploaded', 400);

    const url = await uploadService.uploadKycDocument(req.file, req.user.id, 'selfie');

    const vendorResult = await query(
      'SELECT id FROM vendor_profiles WHERE user_id = $1',
      [req.user.id]
    );
    const vendorId = vendorResult.rows[0].id;

    await query(
      `UPDATE kyc_documents SET selfie_url = $1, updated_at = NOW()
       WHERE vendor_id = $2`,
      [url, vendorId]
    );

    return success(res, { url }, 'Selfie uploaded');
  } catch (err) {
    logger.error('Upload selfie error', err);
    return error(res, 'Failed to upload selfie');
  }
};

// ── Add Service Tags (max 4) ──────────────────────────────────────
exports.addServices = async (req, res) => {
  try {
    const { service_ids } = req.body;
    if (!Array.isArray(service_ids) || service_ids.length === 0) {
      return error(res, 'Please select at least one service', 400);
    }
    if (service_ids.length > 4) {
      return error(res, 'Maximum 4 service tags allowed', 400);
    }

    const vendorResult = await query(
      'SELECT id FROM vendor_profiles WHERE user_id = $1',
      [req.user.id]
    );
    const vendorId = vendorResult.rows[0].id;

    // Verify all services are approved
    const servicesResult = await query(
      'SELECT id FROM services WHERE id = ANY($1) AND is_approved = TRUE',
      [service_ids]
    );
    if (servicesResult.rows.length !== service_ids.length) {
      return error(res, 'One or more services are invalid', 400);
    }

    // Replace existing services
    await query('DELETE FROM vendor_services WHERE vendor_id = $1', [vendorId]);
    for (const serviceId of service_ids) {
      await query(
        'INSERT INTO vendor_services (vendor_id, service_id) VALUES ($1, $2)',
        [vendorId, serviceId]
      );
    }

    return success(res, {}, 'Services updated');
  } catch (err) {
    logger.error('Add services error', err);
    return error(res, 'Failed to update services');
  }
};

// ── Upload Portfolio Images (max 4) ───────────────────────────────
exports.uploadPortfolio = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return error(res, 'No files uploaded', 400);

    const vendorResult = await query(
      'SELECT id FROM vendor_profiles WHERE user_id = $1',
      [req.user.id]
    );
    const vendorId = vendorResult.rows[0].id;

    // Check existing count
    const countResult = await query(
      'SELECT COUNT(*) FROM portfolio_images WHERE vendor_id = $1',
      [vendorId]
    );
    const existing = parseInt(countResult.rows[0].count);
    if (existing + req.files.length > 4) {
      return error(res, `You can only have 4 portfolio images. You currently have ${existing}.`, 400);
    }

    const urls = [];
    for (let i = 0; i < req.files.length; i++) {
      const url = await uploadService.uploadPortfolioImage(req.files[i], req.user.id);
      const isCover = existing === 0 && i === 0; // First image is cover
      await query(
        `INSERT INTO portfolio_images (vendor_id, image_url, is_cover, position)
         VALUES ($1, $2, $3, $4)`,
        [vendorId, url, isCover, existing + i]
      );
      urls.push(url);
    }

    return success(res, { urls, cover: urls[0] }, 'Portfolio images uploaded');
  } catch (err) {
    logger.error('Upload portfolio error', err);
    return error(res, 'Failed to upload portfolio images');
  }
};

// ── Update Location + Availability ───────────────────────────────
exports.updateLocationAvailability = async (req, res) => {
  try {
    const {
      location_type, location_area, location_lat, location_lng,
      service_radius_km, availability_text, available_days,
      available_from, available_to, price_min, price_max, price_negotiable
    } = req.body;

    await query(
      `UPDATE vendor_profiles SET
         location_type = $1, location_area = $2,
         location_lat = $3, location_lng = $4,
         service_radius_km = $5, availability_text = $6,
         available_days = $7, available_from = $8, available_to = $9,
         price_min = $10, price_max = $11, price_negotiable = $12,
         updated_at = NOW()
       WHERE user_id = $13`,
      [location_type, location_area, location_lat, location_lng,
       service_radius_km, availability_text, available_days,
       available_from, available_to, price_min, price_max, price_negotiable,
       req.user.id]
    );

    return success(res, {}, 'Location and availability updated');
  } catch (err) {
    logger.error('Update location error', err);
    return error(res, 'Failed to update location');
  }
};

// ── Submit KYC for Review ─────────────────────────────────────────
exports.submitForReview = async (req, res) => {
  try {
    const userId = req.user.id;

    const vendorResult = await query(
      `SELECT vp.id, vp.kyc_status,
              kd.id_document_url, kd.selfie_url, kd.bvn, kd.account_number,
              (SELECT COUNT(*) FROM vendor_services WHERE vendor_id = vp.id) as service_count,
              (SELECT COUNT(*) FROM portfolio_images WHERE vendor_id = vp.id) as image_count
       FROM vendor_profiles vp
       LEFT JOIN kyc_documents kd ON kd.vendor_id = vp.id
       WHERE vp.user_id = $1`,
      [userId]
    );

    const vendor = vendorResult.rows[0];
    if (!vendor) return notFound(res, 'Vendor profile not found');

    // Validate completeness
    const missing = [];
    if (!vendor.id_document_url) missing.push('ID document');
    if (!vendor.selfie_url) missing.push('Selfie');
    if (!vendor.bvn) missing.push('BVN');
    if (!vendor.account_number) missing.push('Bank account');
    if (parseInt(vendor.service_count) === 0) missing.push('At least one service');
    if (parseInt(vendor.image_count) === 0) missing.push('Portfolio image');

    if (missing.length > 0) {
      return error(res, `Please complete: ${missing.join(', ')}`, 400);
    }

    await query(
      `UPDATE vendor_profiles SET kyc_status = 'under_review', updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    await notificationService.sendToUser(userId, {
      type: 'kyc_submitted',
      title: 'KYC submitted',
      body: 'We are reviewing your profile. This usually takes 24-48 hours.',
    });

    return success(res, {}, 'KYC submitted for review');
  } catch (err) {
    logger.error('Submit KYC error', err);
    return error(res, 'Failed to submit KYC');
  }
};

// ── Get KYC Status ────────────────────────────────────────────────
exports.getKycStatus = async (req, res) => {
  try {
    const result = await query(
      `SELECT vp.kyc_status, vp.kyc_rejection_reason, vp.status,
              vp.verified_at,
              (SELECT COUNT(*) FROM vendor_services WHERE vendor_id = vp.id) as service_count,
              (SELECT COUNT(*) FROM portfolio_images WHERE vendor_id = vp.id) as image_count,
              kd.id_document_url IS NOT NULL as has_id,
              kd.selfie_url IS NOT NULL as has_selfie,
              kd.bvn IS NOT NULL as has_bvn,
              kd.account_number IS NOT NULL as has_bank
       FROM vendor_profiles vp
       LEFT JOIN kyc_documents kd ON kd.vendor_id = vp.id
       WHERE vp.user_id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) return notFound(res, 'Vendor profile not found');

    return success(res, result.rows[0], 'KYC status retrieved');
  } catch (err) {
    logger.error('Get KYC status error', err);
    return error(res, 'Failed to get KYC status');
  }
};

// ── Suggest New Service ───────────────────────────────────────────
exports.suggestService = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return error(res, 'Service name must be at least 2 characters', 400);
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check if already exists
    const existing = await query(
      'SELECT id FROM services WHERE slug = $1',
      [slug]
    );
    if (existing.rows[0]) {
      return error(res, 'This service already exists on the platform', 409);
    }

    await query(
      `INSERT INTO services (name, slug, is_approved, suggested_by)
       VALUES ($1, $2, FALSE, $3)`,
      [name.trim(), slug, req.user.id]
    );

    return created(res, {}, 'Service suggestion submitted for review');
  } catch (err) {
    logger.error('Suggest service error', err);
    return error(res, 'Failed to suggest service');
  }
};
