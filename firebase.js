const { getDoc, addDoc, updateDoc, queryDocs } = require('../config/firebase');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

const OFFER_EXPIRY_HOURS = parseInt(process.env.OFFER_EXPIRY_HOURS) || 2;
const MAX_ROUNDS = 3;

// POST /api/offers
exports.createOffer = async (req, res) => {
  try {
    const { vendorId, serviceName, description, amount } = req.body;
    if (!vendorId || !amount) return fail(res, 'vendorId and amount required', 400);
    if (!Number.isInteger(amount) || amount < 10000) return fail(res, 'Amount must be at least ₦100', 400);
    if (amount > 1_000_000_00) return fail(res, 'Amount exceeds the maximum allowed', 400);

    const vendor = await getDoc('users', vendorId);
    if (!vendor || vendor.kycStatus !== 'approved') return fail(res, 'Vendor not available', 404);

    const existing = await queryDocs('offers', [
      ['customerId', '==', req.user.userId],
      ['vendorId', '==', vendorId],
      ['status', 'in', ['pending', 'countered']],
    ], null, 1);
    if (existing.length > 0) return fail(res, 'You already have an active offer with this vendor', 409);

    const expiresAt = new Date(Date.now() + OFFER_EXPIRY_HOURS * 3600000).toISOString();
    const customer = await getDoc('users', req.user.userId);

    const offer = await addDoc('offers', {
      customerId: req.user.userId,
      customerName: customer.fullName,
      vendorId,
      vendorName: vendor.fullName,
      serviceName: serviceName || 'Service',
      description: description || null,
      customerAmount: amount,
      vendorAmount: null,
      finalAmount: null,
      roundNumber: 1,
      status: 'pending',
      expiresAt,
    });

    return ok(res, offer, 'Offer sent', 201);
  } catch (err) {
    logger.error('createOffer: ' + err.message);
    return fail(res, 'Failed to create offer');
  }
};

// POST /api/offers/:id/respond
exports.respondToOffer = async (req, res) => {
  try {
    const { action, counterAmount } = req.body;
    const offer = await getDoc('offers', req.params.id);
    if (!offer) return fail(res, 'Offer not found', 404);

    const isVendor = offer.vendorId === req.user.userId;
    const isCustomer = offer.customerId === req.user.userId;
    if (!isVendor && !isCustomer) return fail(res, 'Not authorized', 403);

    if (!['pending', 'countered'].includes(offer.status)) return fail(res, 'Offer no longer active', 400);
    if (new Date(offer.expiresAt) < new Date()) {
      await updateDoc('offers', offer.id, { status: 'expired' });
      return fail(res, 'Offer has expired', 400);
    }
    if (offer.status === 'pending' && !isVendor) return fail(res, 'Waiting for vendor response', 400);
    if (offer.status === 'countered' && !isCustomer) return fail(res, 'Waiting for customer response', 400);

    if (action === 'accept') {
      const finalAmount = offer.status === 'countered' ? offer.vendorAmount : offer.customerAmount;
      await updateDoc('offers', offer.id, { status: 'accepted', finalAmount });
      return ok(res, { ...offer, status: 'accepted', finalAmount }, 'Offer accepted! Proceed to payment.');
    }

    if (action === 'reject') {
      await updateDoc('offers', offer.id, { status: 'rejected' });
      return ok(res, {}, 'Offer rejected');
    }

    if (action === 'counter') {
      if (offer.roundNumber >= MAX_ROUNDS) return fail(res, `Max ${MAX_ROUNDS} negotiation rounds reached`, 400);
      if (!counterAmount) return fail(res, 'counterAmount required', 400);
      if (!Number.isInteger(counterAmount) || counterAmount < 10000) return fail(res, 'Counter must be at least ₦100', 400);
      if (counterAmount > 1_000_000_00) return fail(res, 'Counter exceeds the maximum allowed', 400);
      const expiresAt = new Date(Date.now() + OFFER_EXPIRY_HOURS * 3600000).toISOString();
      await updateDoc('offers', offer.id, {
        status: 'countered',
        vendorAmount: counterAmount,
        roundNumber: offer.roundNumber + 1,
        expiresAt,
      });
      return ok(res, { ...offer, status: 'countered' }, 'Counter offer sent');
    }

    return fail(res, 'Invalid action', 400);
  } catch (err) {
    logger.error('respondToOffer: ' + err.message);
    return fail(res, 'Failed to respond');
  }
};

// GET /api/offers/mine
exports.getMyOffers = async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.user.userId;

    const asCustomer = await queryDocs('offers', [['customerId', '==', userId]]);
    const asVendor = await queryDocs('offers', [['vendorId', '==', userId]]);

    let all = [...asCustomer, ...asVendor].sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    if (status) all = all.filter(o => o.status === status);

    return ok(res, all);
  } catch (err) {
    return fail(res, 'Failed to get offers');
  }
};

// GET /api/offers/:id
exports.getOffer = async (req, res) => {
  try {
    const offer = await getDoc('offers', req.params.id);
    if (!offer) return fail(res, 'Not found', 404);
    if (offer.customerId !== req.user.userId && offer.vendorId !== req.user.userId) return fail(res, 'Not authorized', 403);
    return ok(res, offer);
  } catch {
    return fail(res, 'Failed');
  }
};
