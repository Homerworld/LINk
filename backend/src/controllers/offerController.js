const { query, getClient } = require('../config/database');
const { success, created, error, notFound, forbidden } = require('../utils/response');
const { generateJobReference, calculateFees, addHours } = require('../utils/helpers');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const MAX_ROUNDS = parseInt(process.env.MAX_COUNTER_OFFERS || '3');
const OFFER_EXPIRY_HOURS = parseFloat(process.env.OFFER_EXPIRY_HOURS || '2');

// ── Create initial offer (customer → vendor) ──────────────────────
exports.createOffer = async (req, res) => {
  const client = await getClient();
  try {
    const { vendor_id, service_id, amount, description, job_location, scheduled_at } = req.body;
    const customerId = req.user.id;

    // Cannot offer to yourself
    if (vendor_id === customerId) return error(res, 'Invalid request', 400);

    // Verify vendor is active
    const vendorResult = await query(
      `SELECT u.id, u.full_name, u.expo_push_token,
              vp.price_min, vp.price_max, vp.price_negotiable
       FROM users u
       JOIN vendor_profiles vp ON vp.user_id = u.id
       WHERE u.id = $1 AND vp.status = 'active' AND vp.kyc_status = 'approved'`,
      [vendor_id]
    );
    if (!vendorResult.rows[0]) return notFound(res, 'Vendor not found or unavailable');

    // Verify service exists
    const serviceResult = await query(
      'SELECT id, name FROM services WHERE id = $1 AND is_approved = TRUE',
      [service_id]
    );
    if (!serviceResult.rows[0]) return notFound(res, 'Service not found');

    const expiresAt = addHours(new Date(), OFFER_EXPIRY_HOURS);
    const jobRef = generateJobReference();

    await client.query('BEGIN');

    // Create job in negotiating state
    const jobResult = await client.query(
      `INSERT INTO jobs
         (reference, customer_id, vendor_id, service_id, status, description, job_location, scheduled_at)
       VALUES ($1, $2, $3, $4, 'negotiating', $5, $6, $7)
       RETURNING id, reference`,
      [jobRef, customerId, vendor_id, service_id, description, job_location, scheduled_at]
    );
    const job = jobResult.rows[0];

    // Create initial offer
    const offerResult = await client.query(
      `INSERT INTO offers (job_id, offered_by, amount, round, status, expires_at)
       VALUES ($1, $2, $3, 1, 'pending', $4)
       RETURNING id`,
      [job.id, customerId, amount, expiresAt]
    );

    await client.query('COMMIT');

    // Notify vendor
    const customer = await query('SELECT full_name FROM users WHERE id = $1', [customerId]);
    const { formatNaira } = require('../utils/helpers');

    await notificationService.sendToUser(vendor_id, {
      type: 'offer_received',
      title: 'New offer received',
      body: `${customer.rows[0].full_name} offered ${formatNaira(amount)} for ${serviceResult.rows[0].name}`,
      data: { job_id: job.id, job_reference: job.reference },
    });

    return created(res, {
      job_id: job.id,
      job_reference: job.reference,
      offer_id: offerResult.rows[0].id,
      expires_at: expiresAt,
    }, 'Offer sent successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Create offer error', err);
    return error(res, 'Failed to send offer');
  } finally {
    client.release();
  }
};

// ── Vendor responds to offer ──────────────────────────────────────
exports.respondToOffer = async (req, res) => {
  const client = await getClient();
  try {
    const { offerId } = req.params;
    const { action, amount, reason } = req.body; // action: 'accept' | 'counter' | 'decline'
    const vendorId = req.user.id;

    // Fetch the offer and job
    const offerResult = await query(
      `SELECT o.*, j.customer_id, j.vendor_id, j.status as job_status,
              j.id as job_id, j.reference,
              (SELECT COUNT(*) FROM offers WHERE job_id = o.job_id) as round_count
       FROM offers o
       JOIN jobs j ON j.id = o.job_id
       WHERE o.id = $1 AND o.status = 'pending'`,
      [offerId]
    );

    const offer = offerResult.rows[0];
    if (!offer) return notFound(res, 'Offer not found or already responded to');
    if (offer.vendor_id !== vendorId) return forbidden(res, 'Not your offer to respond to');
    if (offer.job_status !== 'negotiating') return error(res, 'This job is no longer in negotiation', 400);
    if (new Date(offer.expires_at) < new Date()) return error(res, 'This offer has expired', 400);

    await client.query('BEGIN');

    if (action === 'accept') {
      // Mark offer accepted
      await client.query(
        "UPDATE offers SET status = 'accepted', updated_at = NOW() WHERE id = $1",
        [offerId]
      );
      // Update job with agreed amount
      const fees = calculateFees(offer.amount);
      await client.query(
        `UPDATE jobs SET
           status = 'payment_pending',
           agreed_amount = $1,
           platform_fee = $2,
           vendor_payout = $3,
           updated_at = NOW()
         WHERE id = $4`,
        [offer.amount, fees.platformFee, fees.vendorPayout, offer.job_id]
      );
      await client.query('COMMIT');

      // Notify customer
      const { formatNaira } = require('../utils/helpers');
      await notificationService.sendToUser(offer.customer_id, {
        type: 'offer_accepted',
        title: 'Offer accepted!',
        body: `Your offer of ${formatNaira(offer.amount)} was accepted. Tap to pay now.`,
        data: { job_id: offer.job_id, job_reference: offer.reference },
      });

      return success(res, { job_id: offer.job_id, agreed_amount: offer.amount }, 'Offer accepted');

    } else if (action === 'counter') {
      if (!amount) return error(res, 'Counter amount required', 400);
      if (parseInt(offer.round_count) >= MAX_ROUNDS) {
        return error(res, `Maximum ${MAX_ROUNDS} negotiation rounds reached`, 400);
      }

      // Mark current offer as countered
      await client.query(
        "UPDATE offers SET status = 'countered', updated_at = NOW() WHERE id = $1",
        [offerId]
      );

      // Create new counter offer from vendor
      const expiresAt = addHours(new Date(), OFFER_EXPIRY_HOURS);
      await client.query(
        `INSERT INTO offers (job_id, offered_by, amount, reason, round, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [offer.job_id, vendorId, amount, reason, parseInt(offer.round_count) + 1, expiresAt]
      );

      await client.query('COMMIT');

      const { formatNaira } = require('../utils/helpers');
      await notificationService.sendToUser(offer.customer_id, {
        type: 'offer_countered',
        title: 'Counter offer received',
        body: `Vendor countered at ${formatNaira(amount)}. Tap to respond.`,
        data: { job_id: offer.job_id, job_reference: offer.reference },
      });

      return success(res, { job_id: offer.job_id, counter_amount: amount }, 'Counter offer sent');

    } else if (action === 'decline') {
      await client.query(
        "UPDATE offers SET status = 'declined', updated_at = NOW() WHERE id = $1",
        [offerId]
      );
      await client.query(
        "UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
        [offer.job_id]
      );
      await client.query('COMMIT');

      await notificationService.sendToUser(offer.customer_id, {
        type: 'offer_declined',
        title: 'Offer declined',
        body: 'The vendor declined your offer. Try another provider nearby.',
        data: { job_id: offer.job_id },
      });

      return success(res, {}, 'Offer declined');
    } else {
      await client.query('ROLLBACK');
      return error(res, 'Invalid action. Use accept, counter, or decline', 400);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Respond to offer error', err);
    return error(res, 'Failed to respond to offer');
  } finally {
    client.release();
  }
};

// ── Customer accepts vendor counter ──────────────────────────────
exports.acceptCounter = async (req, res) => {
  const client = await getClient();
  try {
    const { offerId } = req.params;
    const customerId = req.user.id;

    const offerResult = await query(
      `SELECT o.*, j.customer_id, j.vendor_id, j.id as job_id, j.reference, j.status as job_status
       FROM offers o JOIN jobs j ON j.id = o.job_id
       WHERE o.id = $1 AND o.status = 'pending'`,
      [offerId]
    );

    const offer = offerResult.rows[0];
    if (!offer) return notFound(res, 'Offer not found');
    if (offer.customer_id !== customerId) return forbidden(res, 'Not your offer');
    if (offer.job_status !== 'negotiating') return error(res, 'Job no longer in negotiation', 400);

    const fees = calculateFees(offer.amount);

    await client.query('BEGIN');
    await client.query(
      "UPDATE offers SET status = 'accepted', updated_at = NOW() WHERE id = $1",
      [offerId]
    );
    await client.query(
      `UPDATE jobs SET status = 'payment_pending',
         agreed_amount = $1, platform_fee = $2, vendor_payout = $3, updated_at = NOW()
       WHERE id = $4`,
      [offer.amount, fees.platformFee, fees.vendorPayout, offer.job_id]
    );
    await client.query('COMMIT');

    const { formatNaira } = require('../utils/helpers');
    await notificationService.sendToUser(offer.vendor_id, {
      type: 'offer_accepted',
      title: 'Terms agreed',
      body: `Customer accepted ${formatNaira(offer.amount)}. Awaiting payment.`,
      data: { job_id: offer.job_id, job_reference: offer.reference },
    });

    return success(res, { job_id: offer.job_id, agreed_amount: offer.amount }, 'Terms agreed. Proceed to payment.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Accept counter error', err);
    return error(res, 'Failed to accept counter offer');
  } finally {
    client.release();
  }
};

// ── Get pending offers for vendor ─────────────────────────────────
exports.getVendorOffers = async (req, res) => {
  try {
    const result = await query(
      `SELECT o.id, o.amount, o.round, o.expires_at, o.created_at,
              j.id as job_id, j.reference, j.description, j.job_location, j.scheduled_at,
              s.name as service_name,
              u.full_name as customer_name, u.profile_photo_url as customer_photo
       FROM offers o
       JOIN jobs j ON j.id = o.job_id
       JOIN services s ON s.id = j.service_id
       JOIN users u ON u.id = j.customer_id
       WHERE j.vendor_id = $1 AND o.status = 'pending' AND o.offered_by != $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    return success(res, result.rows, 'Offers retrieved');
  } catch (err) {
    return error(res, 'Failed to get offers');
  }
};

// ── Get job negotiation thread ────────────────────────────────────
exports.getNegotiationThread = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const jobResult = await query(
      'SELECT id, customer_id, vendor_id, status, agreed_amount FROM jobs WHERE id = $1',
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) return notFound(res, 'Job not found');
    if (job.customer_id !== userId && job.vendor_id !== userId) {
      return forbidden(res, 'Not your job');
    }

    const offers = await query(
      `SELECT o.id, o.offered_by, o.amount, o.reason, o.round, o.status,
              o.expires_at, o.created_at,
              u.full_name as offered_by_name
       FROM offers o
       JOIN users u ON u.id = o.offered_by
       WHERE o.job_id = $1
       ORDER BY o.round ASC, o.created_at ASC`,
      [jobId]
    );

    return success(res, { job, offers: offers.rows }, 'Negotiation thread retrieved');
  } catch (err) {
    return error(res, 'Failed to get negotiation thread');
  }
};
