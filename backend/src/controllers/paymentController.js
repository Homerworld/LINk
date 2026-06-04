// ── PAYMENT CONTROLLER ────────────────────────────────────────────
const axios = require('axios');
const crypto = require('crypto');
const { getDoc, addDoc, updateDoc, queryDocs, increment } = require('../config/firebase');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

const PLATFORM_FEE_PCT = parseInt(process.env.PLATFORM_FEE_PERCENT) || 10;
const PAYSTACK = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
});

exports.initiatePayment = async (req, res) => {
  try {
    const { offerId } = req.body;
    const offer = await getDoc('offers', offerId);
    if (!offer || offer.status !== 'accepted' || offer.customerId !== req.user.userId) {
      return fail(res, 'Accepted offer not found', 404);
    }

    const existing = await queryDocs('jobs', [['offerId', '==', offerId]], null, 1);
    if (existing.length > 0) return fail(res, 'Payment already initiated', 409);

    const amount = offer.finalAmount;
    const platformFee = Math.round(amount * PLATFORM_FEE_PCT / 100);
    const vendorPayout = amount - platformFee;
    const reference = `LINK-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

    const customer = await getDoc('users', req.user.userId);

    await addDoc('jobs', {
      offerId,
      customerId: offer.customerId,
      customerName: offer.customerName,
      vendorId: offer.vendorId,
      vendorName: offer.vendorName,
      serviceName: offer.serviceName,
      agreedAmount: amount,
      platformFee,
      vendorPayout,
      paystackReference: reference,
      paymentVerified: false,
      status: 'pending_payment',
    });

    // Dev mode — no Paystack key
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key || key.includes('xxxx')) {
      return ok(res, {
        reference,
        amount,
        amountFormatted: `₦${(amount/100).toLocaleString()}`,
        authorizationUrl: null,
        devMode: true,
        tip: `Use POST /api/payments/dev-confirm/${reference} to simulate payment`,
      }, 'Payment initiated (dev mode)');
    }

    const pRes = await PAYSTACK.post('/transaction/initialize', {
      email: customer.email || `${customer.phone}@link.app`,
      amount,
      reference,
      metadata: { offerId, customerId: req.user.userId },
    });

    return ok(res, {
      reference,
      amount,
      amountFormatted: `₦${(amount/100).toLocaleString()}`,
      authorizationUrl: pRes.data.data.authorization_url,
    }, 'Payment initiated');
  } catch (err) {
    logger.error('initiatePayment: ' + err.message);
    return fail(res, 'Payment failed');
  }
};

exports.webhook = async (req, res) => {
  try {
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '')
      .update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(400).end();
    if (req.body.event === 'charge.success') await activateJob(req.body.data.reference);
    return res.json({ received: true });
  } catch (err) {
    logger.error('webhook: ' + err.message);
    return res.status(500).end();
  }
};

exports.devConfirm = async (req, res) => {
  if (process.env.NODE_ENV === 'production') return fail(res, 'Not available in production', 403);
  try {
    await activateJob(req.params.reference);
    return ok(res, {}, 'Payment confirmed (dev mode)');
  } catch (err) {
    return fail(res, err.message);
  }
};

exports.getBanks = async (req, res) => {
  try {
    const r = await PAYSTACK.get('/bank?currency=NGN&perPage=100');
    return ok(res, r.data.data.map(b => ({ code: b.code, name: b.name })));
  } catch {
    return ok(res, [
      { code: '044', name: 'Access Bank' }, { code: '023', name: 'Citibank Nigeria' },
      { code: '050', name: 'EcoBank Nigeria' }, { code: '070', name: 'Fidelity Bank' },
      { code: '011', name: 'First Bank of Nigeria' }, { code: '214', name: 'FCMB' },
      { code: '058', name: 'GTBank' }, { code: '030', name: 'Heritage Bank' },
      { code: '082', name: 'Keystone Bank' }, { code: '526', name: 'Moniepoint MFB' },
      { code: '076', name: 'Polaris Bank' }, { code: '221', name: 'Stanbic IBTC' },
      { code: '232', name: 'Sterling Bank' }, { code: '032', name: 'Union Bank' },
      { code: '033', name: 'UBA' }, { code: '035', name: 'Wema Bank' },
      { code: '057', name: 'Zenith Bank' }, { code: '000025', name: 'Opay' },
      { code: '000026', name: 'Palmpay' }, { code: '000023', name: 'Kuda Bank' },
    ]);
  }
};

const activateJob = async (reference) => {
  const jobs = await queryDocs('jobs', [['paystackReference', '==', reference]], null, 1);
  if (jobs.length === 0) throw new Error('Job not found');
  const job = jobs[0];
  if (job.paymentVerified) return;
  const COMPLETION_HOURS = parseInt(process.env.JOB_COMPLETION_WINDOW_HOURS) || 24;
  const autoReleaseAt = new Date(Date.now() + COMPLETION_HOURS * 3600000).toISOString();
  await updateDoc('jobs', job.id, { status: 'active', paymentVerified: true, startedAt: new Date().toISOString(), autoReleaseAt });
  // Credit escrow
  const vendor = await getDoc('users', job.vendorId);
  await updateDoc('users', job.vendorId, { escrowBalance: (vendor.escrowBalance || 0) + job.vendorPayout });
  logger.info(`Job activated: ${job.id}`);
};

module.exports.activateJob = activateJob;
