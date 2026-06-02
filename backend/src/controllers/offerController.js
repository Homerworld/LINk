const { query } = require('../config/database');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

const MAX_ROUNDS = 3;
const OFFER_EXPIRY_HOURS = parseInt(process.env.OFFER_EXPIRY_HOURS) || 2;

// POST /api/offers — customer creates initial offer
exports.createOffer = async (req, res) => {
  try {
    const { vendor_id, service_id, service_name, description, amount } = req.body;
    const customerId = req.user.userId;

    // Check vendor exists and is approved
    const vendorCheck = await query(
      `SELECT u.id FROM users u
       JOIN vendor_profiles vp ON vp.user_id = u.id
       WHERE u.id = $1 AND vp.kyc_status = 'approved' AND u.is_active = TRUE`,
      [vendor_id]
    );
    if (vendorCheck.rows.length === 0) {
      return error(res, 'Vendor not found or not available', 404);
    }

    // Check no active offer between these two
    const activeOffer = await query(
      `SELECT id FROM offers
       WHERE customer_id = $1 AND vendor_id = $2
       AND status IN ('pending', 'countered')`,
      [customerId, vendor_id]
    );
    if (activeOffer.rows.length > 0) {
      return error(res, 'You already have an active offer with this vendor', 409);
    }

    const expiresAt = new Date(Date.now() + OFFER_EXPIRY_HOURS * 60 * 60 * 1000);

    // Get service name if not provided
    let svcName = service_name;
    if (!svcName && service_id) {
      const svc = await query(`SELECT name FROM services WHERE id = $1`, [service_id]);
      if (svc.rows.length > 0) svcName = svc.rows[0].name;
    }

    const result = await query(
      `INSERT INTO offers (customer_id, vendor_id, service_id, service_name, description, customer_amount, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [customerId, vendor_id, service_id || null, svcName || 'Service', description || null, amount, expiresAt]
    );

    return success(res, result.rows[0], 'Offer sent', 201);
  } catch (err) {
    logger.error('createOffer error: ' + err.message);
    return error(res, 'Failed to create offer');
  }
};

// POST /api/offers/:id/respond — vendor responds to offer
exports.respondToOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, counter_amount } = req.body;
    const userId = req.user.userId;

    const offerResult = await query(`SELECT * FROM offers WHERE id = $1`, [id]);
    if (offerResult.rows.length === 0) return error(res, 'Offer not found', 404);

    const offer = offerResult.rows[0];

    // Verify the right person is responding
    const isVendor = offer.vendor_id === userId;
    const isCustomer = offer.customer_id === userId;

    if (!isVendor && !isCustomer) return error(res, 'Not authorized', 403);

    // Vendor responds to customer offer, customer responds to counter
    if (offer.status === 'pending' && !isVendor) return error(res, 'Waiting for vendor response', 400);
    if (offer.status === 'countered' && !isCustomer) return error(res, 'Waiting for customer response', 400);

    if (!['pending', 'countered'].includes(offer.status)) {
      return error(res, 'Offer is no longer active', 400);
    }

    if (new Date(offer.expires_at) < new Date()) {
      await query(`UPDATE offers SET status = 'expired' WHERE id = $1`, [id]);
      return error(res, 'Offer has expired', 400);
    }

    if (action === 'accept') {
      const agreedAmount = offer.status === 'countered' ? offer.vendor_amount : offer.customer_amount;
      await query(
        `UPDATE offers SET status = 'accepted', final_amount = $1, updated_at = NOW() WHERE id = $2`,
        [agreedAmount, id]
      );
      const updated = await query(`SELECT * FROM offers WHERE id = $1`, [id]);
      return success(res, updated.rows[0], 'Offer accepted');
    }

    if (action === 'reject') {
      await query(`UPDATE offers SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [id]);
      return success(res, {}, 'Offer rejected');
    }

    if (action === 'counter') {
      if (offer.round_number >= MAX_ROUNDS) {
        return error(res, `Maximum ${MAX_ROUNDS} negotiation rounds reached`, 400);
      }
      const expiresAt = new Date(Date.now() + OFFER_EXPIRY_HOURS * 60 * 60 * 1000);
      await query(
        `UPDATE offers SET
          status = 'countered',
          vendor_amount = $1,
          round_number = round_number + 1,
          expires_at = $2,
          updated_at = NOW()
         WHERE id = $3`,
        [counter_amount, expiresAt, id]
      );
      const updated = await query(`SELECT * FROM offers WHERE id = $1`, [id]);
      return success(res, updated.rows[0], 'Counter offer sent');
    }
  } catch (err) {
    logger.error('respondToOffer error: ' + err.message);
    return error(res, 'Failed to respond to offer');
  }
};

// GET /api/offers/mine — get user's offers
exports.getMyOffers = async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.user.userId;

    let sql = `
      SELECT o.*,
        c.full_name AS customer_name,
        v.full_name AS vendor_name
      FROM offers o
      JOIN users c ON c.id = o.customer_id
      JOIN users v ON v.id = o.vendor_id
      WHERE (o.customer_id = $1 OR o.vendor_id = $1)
    `;
    const params = [userId];

    if (status) {
      sql += ` AND o.status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY o.updated_at DESC LIMIT 50`;

    const result = await query(sql, params);
    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Failed to get offers');
  }
};

// GET /api/offers/:id
exports.getOffer = async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*,
        c.full_name AS customer_name,
        v.full_name AS vendor_name
       FROM offers o
       JOIN users c ON c.id = o.customer_id
       JOIN users v ON v.id = o.vendor_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return error(res, 'Offer not found', 404);
    return success(res, result.rows[0]);
  } catch (err) {
    return error(res, 'Failed to get offer');
  }
};
