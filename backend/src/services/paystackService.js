const axios = require('axios');
const logger = require('../utils/logger');

const PAYSTACK_BASE = 'https://api.paystack.co';
const headers = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
});

// ── Initialize card payment ───────────────────────────────────────
exports.initializePayment = async ({ email, amountKobo, reference, metadata }) => {
  try {
    const response = await axios.post(`${PAYSTACK_BASE}/transaction/initialize`, {
      email,
      amount: amountKobo,
      reference,
      metadata,
      callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
    }, { headers: headers() });

    return response.data.data; // { authorization_url, access_code, reference }
  } catch (err) {
    logger.error('Paystack initialize error', err.response?.data || err.message);
    throw new Error('Payment initialization failed');
  }
};

// ── Create dedicated virtual account for bank transfer ────────────
exports.createVirtualAccount = async ({ customerId, name, email, jobReference }) => {
  try {
    // First create a customer on Paystack
    const customerRes = await axios.post(`${PAYSTACK_BASE}/customer`, {
      email, first_name: name.split(' ')[0], last_name: name.split(' ')[1] || '',
    }, { headers: headers() });

    const customerCode = customerRes.data.data.customer_code;

    // Create dedicated virtual account
    const dvaRes = await axios.post(`${PAYSTACK_BASE}/dedicated_account`, {
      customer: customerCode,
      preferred_bank: 'wema-bank', // Paystack supported bank for DVA
      metadata: { job_reference: jobReference }
    }, { headers: headers() });

    return dvaRes.data.data; // { account_number, bank, account_name }
  } catch (err) {
    logger.error('Create virtual account error', err.response?.data || err.message);
    throw new Error('Virtual account creation failed');
  }
};

// ── Verify transaction ────────────────────────────────────────────
exports.verifyTransaction = async (reference) => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${reference}`,
      { headers: headers() }
    );
    return response.data.data; // { status, amount, reference, ... }
  } catch (err) {
    logger.error('Paystack verify error', err.response?.data || err.message);
    throw new Error('Transaction verification failed');
  }
};

// ── Resolve bank account ──────────────────────────────────────────
exports.resolveAccount = async (accountNumber, bankCode) => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { headers: headers() }
    );
    return response.data.data; // { account_number, account_name, bank_id }
  } catch (err) {
    logger.error('Resolve account error', err.response?.data || err.message);
    throw new Error('Account resolution failed');
  }
};

// ── Get list of banks ─────────────────────────────────────────────
exports.getBanks = async () => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE}/bank?country=nigeria&use_cursor=false&perPage=100`,
      { headers: headers() }
    );
    return response.data.data;
  } catch (err) {
    logger.error('Get banks error', err.message);
    throw new Error('Failed to fetch banks');
  }
};

// ── Initiate vendor withdrawal (transfer) ─────────────────────────
exports.initiateTransfer = async ({ amount, recipientCode, reference, reason }) => {
  try {
    const response = await axios.post(`${PAYSTACK_BASE}/transfer`, {
      source: 'balance',
      amount,
      recipient: recipientCode,
      reference,
      reason,
    }, { headers: headers() });
    return response.data.data;
  } catch (err) {
    logger.error('Paystack transfer error', err.response?.data || err.message);
    throw new Error('Transfer initiation failed');
  }
};

// ── Create transfer recipient ─────────────────────────────────────
exports.createTransferRecipient = async ({ name, accountNumber, bankCode }) => {
  try {
    const response = await axios.post(`${PAYSTACK_BASE}/transferrecipient`, {
      type: 'nuban',
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    }, { headers: headers() });
    return response.data.data; // { recipient_code, ... }
  } catch (err) {
    logger.error('Create recipient error', err.response?.data || err.message);
    throw new Error('Failed to create transfer recipient');
  }
};

// ── Validate Paystack webhook signature ───────────────────────────
exports.validateWebhook = (payload, signature) => {
  const crypto = require('crypto');
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return hash === signature;
};
