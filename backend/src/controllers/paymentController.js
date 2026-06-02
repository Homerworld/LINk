const axios = require('axios');
const crypto = require('crypto');
const { query, getClient } = require('../config/database');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

const PLATFORM_FEE_PERCENT = parseInt(process.env.PLATFORM_FEE_PERCENT) || 10;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const paystackAPI = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
});

// POST /api/payments/initiate — customer pays for accepted offer
exports.initiatePayment = async (req, res) => {
  try {
    const { offer_id } = req.body;
    const customerId = req.user.userId;

    const offerResult = await query(
      `SELECT o.*, u.email AS customer_email
       FROM offers o
       JOIN users u ON u.id = o.customer_id
       WHERE o.id = $1 AND o.customer_id = $2 AND o.status = 'accepted'`,
      [offer_id, customerId]
    );

    if (offerResult.rows.length === 0) {
      return error(res, 'Accepted offer not found', 404);
    }

    const offer = offerResult.rows[0];
    const amount = offer.final_amount;
    const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT / 100);
    const vendorPayout = amount - platformFee;

    // Check no job already exists for this offer
    const existingJob = await query(`SELECT id FROM jobs WHERE offer_id = $1`, [offer_id]);
    if (existingJob.rows.length > 0) {
      return error(res, 'Payment already initiated for this offer', 409);
    }

    const reference = `LINK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Create job record
    await query(
      `INSERT INTO jobs (offer_id, customer_id, vendor_id, service_name, agreed_amount, platform_fee, vendor_payout, paystack_reference, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_payment')`,
      [offer_id, offer.customer_id, offer.vendor_id, offer.service_name, amount, platformFee, vendorPayout, reference]
    );

    if (!PAYSTACK_SECRET || PAYSTACK_SECRET.includes('xxxx')) {
      // Development mode — skip Paystack
      return success(res, {
        reference,
        amount,
        amount_formatted: `₦${(amount / 100).toLocaleString()}`,
        authorization_url: null,
        dev_mode: true,
        message: 'Paystack not configured — use /api/payments/dev-confirm/:reference to simulate payment',
      }, 'Payment initiated (dev mode)');
    }

    const paystackRes = await paystackAPI.post('/transaction/initialize', {
      email: offer.customer_email,
      amount: amount, // already in kobo
      reference,
      metadata: {
        offer_id,
        job_reference: reference,
        customer_id: customerId,
      },
      callback_url: `${process.env.APP_URL || 'https://linkapp.com'}/payment/verify`,
    });

    return success(res, {
      reference,
      amount,
      amount_formatted: `₦${(amount / 100).toLocaleString()}`,
      authorization_url: paystackRes.data.data.authorization_url,
    }, 'Payment initiated');
  } catch (err) {
    logger.error('initiatePayment error: ' + err.message);
    return error(res, 'Failed to initiate payment');
  }
};

// POST /api/payments/webhook — Paystack webhook
exports.webhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET || '')
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const { event, data } = req.body;

    if (event === 'charge.success') {
      await activateJob(data.reference);
    }

    return res.json({ received: true });
  } catch (err) {
    logger.error('webhook error: ' + err.message);
    return res.status(500).json({ error: 'Webhook failed' });
  }
};

// POST /api/payments/dev-confirm/:reference — dev only
exports.devConfirm = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return error(res, 'Not available in production', 403);
  }
  try {
    await activateJob(req.params.reference);
    return success(res, {}, 'Payment confirmed (dev mode)');
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/payments/verify/:reference
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const jobResult = await query(
      `SELECT id, status, payment_verified FROM jobs WHERE paystack_reference = $1`,
      [reference]
    );
    if (jobResult.rows.length === 0) return error(res, 'Payment not found', 404);
    return success(res, jobResult.rows[0]);
  } catch (err) {
    return error(res, 'Failed to verify payment');
  }
};

// GET /api/payments/banks
exports.getBanks = async (req, res) => {
  try {
    const result = await paystackAPI.get('/bank?currency=NGN&perPage=100');
    return success(res, result.data.data.map(b => ({ code: b.code, name: b.name })));
  } catch (err) {
    // Return common Nigerian banks as fallback
    return success(res, [
      { code: '044', name: 'Access Bank' },
      { code: '063', name: 'Access Bank (Diamond)' },
      { code: '035A', name: 'ALAT by WEMA' },
      { code: '401', name: 'ASO Savings and Loans' },
      { code: '023', name: 'Citibank Nigeria' },
      { code: '050', name: 'EcoBank Nigeria' },
      { code: '562', name: 'Ekondo Microfinance Bank' },
      { code: '084', name: 'Enterprise Bank' },
      { code: '070', name: 'Fidelity Bank' },
      { code: '011', name: 'First Bank of Nigeria' },
      { code: '214', name: 'First City Monument Bank' },
      { code: '058', name: 'Guaranty Trust Bank' },
      { code: '030', name: 'Heritage Bank' },
      { code: '301', name: 'Jaiz Bank' },
      { code: '082', name: 'Keystone Bank' },
      { code: '526', name: 'Moniepoint MFB' },
      { code: '014', name: 'Mainstreet Bank' },
      { code: '076', name: 'Polaris Bank' },
      { code: '101', name: 'Providus Bank' },
      { code: '221', name: 'Stanbic IBTC Bank' },
      { code: '068', name: 'Standard Chartered Bank' },
      { code: '232', name: 'Sterling Bank' },
      { code: '100', name: 'Suntrust Bank' },
      { code: '302', name: 'TAJ Bank' },
      { code: '032', name: 'Union Bank of Nigeria' },
      { code: '033', name: 'United Bank for Africa' },
      { code: '215', name: 'Unity Bank' },
      { code: '035', name: 'Wema Bank' },
      { code: '057', name: 'Zenith Bank' },
      { code: '000025', name: 'Opay' },
      { code: '000026', name: 'Palmpay' },
      { code: '000013', name: 'GTBank Mobile Money' },
      { code: '000023', name: 'Kuda Bank' },
    ]);
  }
};

// Internal helper — activate job after payment confirmed
const activateJob = async (reference) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const jobResult = await client.query(
      `UPDATE jobs SET status = 'active', payment_verified = TRUE, started_at = NOW(), updated_at = NOW()
       WHERE paystack_reference = $1 AND status = 'pending_payment'
       RETURNING *`,
      [reference]
    );

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Job not found or already activated');
    }

    const job = jobResult.rows[0];

    // Update vendor wallet escrow balance
    await client.query(
      `UPDATE wallets SET escrow_balance = escrow_balance + $1, updated_at = NOW()
       WHERE vendor_id = $2`,
      [job.vendor_payout, job.vendor_id]
    );

    // Record wallet transaction
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, job_id, type, amount, description)
       SELECT id, $1, 'escrow_in', $2, $3 FROM wallets WHERE vendor_id = $4`,
      [job.id, job.vendor_payout, `Payment received for ${job.service_name}`, job.vendor_id]
    );

    await client.query('COMMIT');
    logger.info(`Job activated: ${job.id} (${reference})`);
    return job;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
