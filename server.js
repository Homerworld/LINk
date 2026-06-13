const bcrypt = require('bcryptjs');
const axios = require('axios');
const { getDoc, updateDoc, queryDocs, addDoc, runTransaction, increment } = require('../config/firebase');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

const MIN = parseInt(process.env.MIN_WITHDRAWAL_NAIRA || '2000');
const PAYSTACK = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
});
const liveKey = () => {
  const k = process.env.PAYSTACK_SECRET_KEY;
  return k && !k.includes('xxxx') && !k.includes('placeholder');
};

exports.getWallet = async (req, res) => {
  try {
    const user = await getDoc('users', req.user.userId);
    if (!user) return fail(res, 'Not found', 404);
    return ok(res, {
      availableBalance: user.availableBalance || 0,
      escrowBalance: user.escrowBalance || 0,
      totalEarned: user.totalEarned || 0,
      bankName: user.bankName || null,
      accountNumber: user.accountNumber || null,
      accountName: user.accountName || null,
    });
  } catch { return fail(res, 'Failed'); }
};

exports.getTransactions = async (req, res) => {
  try {
    const txns = await queryDocs('walletTransactions', [['vendorId', '==', req.user.userId]]);
    txns.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return ok(res, txns);
  } catch { return fail(res, 'Failed'); }
};

exports.withdraw = async (req, res) => {
  try {
    const { amount, pin, idempotencyKey } = req.body;
    if (!amount || !pin) return fail(res, 'Amount and PIN required', 400);
    if (!Number.isInteger(amount) || amount <= 0) return fail(res, 'Invalid amount', 400);
    if (amount < MIN * 100) return fail(res, `Minimum withdrawal is ₦${MIN.toLocaleString()}`, 400);

    const userId = req.user.userId;
    const user = await getDoc('users', userId);
    if (!user) return fail(res, 'Not found', 404);
    if (!user.withdrawalPinHash) return fail(res, 'Set your withdrawal PIN first', 400);
    const pinOk = await bcrypt.compare(String(pin), user.withdrawalPinHash);
    if (!pinOk) return fail(res, 'Incorrect PIN', 401);
    if (!user.accountNumber) return fail(res, 'No bank account linked. Complete KYC first.', 400);

    // Idempotency: if a key is supplied and we've seen it, return the prior result.
    if (idempotencyKey) {
      const seen = await queryDocs('withdrawals', [['vendorId', '==', userId], ['idempotencyKey', '==', idempotencyKey]], null, 1);
      if (seen.length > 0) {
        return ok(res, { amountFormatted: `₦${(seen[0].amount / 100).toLocaleString()}`, bankName: seen[0].bankName, duplicate: true }, 'Withdrawal already submitted');
      }
    }

    // Atomic debit: re-read balance inside the transaction and guard against overdraw.
    let withdrawalId;
    await runTransaction(async (tx, { txGet, txUpdate, txCreate }) => {
      const u = await txGet('users', userId);
      if ((u.availableBalance || 0) < amount) throw new Error('Insufficient balance');
      txUpdate('users', userId, { availableBalance: increment(-amount) });
      const w = txCreate('withdrawals', {
        vendorId: userId,
        amount,
        bankName: u.bankName,
        accountNumber: u.accountNumber,
        accountName: u.accountName,
        status: 'pending',
        idempotencyKey: idempotencyKey || null,
        transferReference: null,
      });
      withdrawalId = w.id;
      txCreate('walletTransactions', {
        vendorId: userId,
        type: 'withdrawal',
        amount,
        description: `Withdrawal to ${u.bankName} ${u.accountNumber}`,
        withdrawalId: w.id,
      });
    });

    // Initiate the actual bank payout. Only runs when a real Paystack key is set;
    // in dev (placeholder key) the withdrawal stays 'pending' for manual processing.
    if (liveKey()) {
      try {
        const recipient = await PAYSTACK.post('/transferrecipient', {
          type: 'nuban',
          name: user.accountName || user.fullName,
          account_number: user.accountNumber,
          bank_code: user.bankCode,
          currency: 'NGN',
        });
        const transfer = await PAYSTACK.post('/transfer', {
          source: 'balance',
          amount,
          recipient: recipient.data.data.recipient_code,
          reason: 'Link vendor payout',
          reference: `LINKWD-${withdrawalId}`,
        });
        await updateDoc('withdrawals', withdrawalId, {
          status: transfer.data.data.status === 'success' ? 'paid' : 'processing',
          transferReference: transfer.data.data.reference,
        });
      } catch (payErr) {
        // Payout call failed AFTER debit — mark for reconciliation, don't silently lose it.
        logger.error('withdraw payout: ' + (payErr.response?.data?.message || payErr.message));
        await updateDoc('withdrawals', withdrawalId, { status: 'needs_review', payoutError: payErr.response?.data?.message || payErr.message });
      }
    }

    return ok(res, {
      amountFormatted: `₦${(amount / 100).toLocaleString()}`,
      bankName: user.bankName,
    }, 'Withdrawal initiated. Expect payment within 24 hours.');
  } catch (err) {
    if (err.message === 'Insufficient balance') return fail(res, 'Insufficient balance', 400);
    logger.error('withdraw: ' + err.message);
    return fail(res, 'Withdrawal failed');
  }
};
