const bcrypt = require('bcryptjs');
const { getDoc, updateDoc, queryDocs, addDoc } = require('../config/firebase');
const { ok, fail } = require('../utils/response');

const MIN = parseInt(process.env.MIN_WITHDRAWAL_NAIRA || '2000');

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
    const txns = await queryDocs('walletTransactions', [['vendorId', '==', req.user.userId]], 'createdAt');
    return ok(res, txns.reverse());
  } catch { return fail(res, 'Failed'); }
};

exports.withdraw = async (req, res) => {
  try {
    const { amount, pin } = req.body;
    if (!amount || !pin) return fail(res, 'Amount and PIN required', 400);
    if (amount < MIN * 100) return fail(res, `Minimum withdrawal is ₦${MIN.toLocaleString()}`, 400);

    const user = await getDoc('users', req.user.userId);
    if (!user.withdrawalPinHash) return fail(res, 'Set your withdrawal PIN first', 400);
    const pinOk = await bcrypt.compare(pin, user.withdrawalPinHash);
    if (!pinOk) return fail(res, 'Incorrect PIN', 401);
    if ((user.availableBalance || 0) < amount) return fail(res, 'Insufficient balance', 400);
    if (!user.accountNumber) return fail(res, 'No bank account linked. Complete KYC first.', 400);

    await updateDoc('users', user.id, {
      availableBalance: user.availableBalance - amount,
    });

    await addDoc('withdrawals', {
      vendorId: user.id, amount,
      bankName: user.bankName, accountNumber: user.accountNumber, accountName: user.accountName,
      status: 'pending',
    });

    await addDoc('walletTransactions', {
      vendorId: user.id, type: 'withdrawal', amount,
      description: `Withdrawal to ${user.bankName} ${user.accountNumber}`,
    });

    return ok(res, {
      amountFormatted: `₦${(amount/100).toLocaleString()}`,
      bankName: user.bankName,
    }, 'Withdrawal initiated. Expect payment within 24 hours.');
  } catch (err) {
    return fail(res, 'Withdrawal failed: ' + err.message);
  }
};
