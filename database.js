const bcrypt = require('bcryptjs');
const axios = require('axios');
const { query } = require('../config/database');
const { success, error } = require('../utils/response');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const MIN_WITHDRAWAL = parseInt(process.env.MIN_WITHDRAWAL_AMOUNT) || 2000;

const paystackAPI = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
});

// GET /api/wallet
exports.getWallet = async (req, res) => {
  try {
    const result = await query(
      `SELECT w.*, u.full_name, vp.bank_name, vp.bank_code, vp.account_number, vp.account_name
       FROM wallets w
       JOIN users u ON u.id = w.vendor_id
       JOIN vendor_profiles vp ON vp.user_id = w.vendor_id
       WHERE w.vendor_id = $1`,
      [req.user.userId]
    );
    if (result.rows.length === 0) return error(res, 'Wallet not found', 404);
    return success(res, result.rows[0]);
  } catch (err) {
    return error(res, 'Failed to get wallet');
  }
};

// GET /api/wallet/transactions
exports.getTransactions = async (req, res) => {
  try {
    const { limit = 30, offset = 0 } = req.query;
    const result = await query(
      `SELECT wt.*, j.service_name AS job_reference
       FROM wallet_transactions wt
       JOIN wallets w ON w.id = wt.wallet_id
       LEFT JOIN jobs j ON j.id = wt.job_id
       WHERE w.vendor_id = $1
       ORDER BY wt.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.userId, parseInt(limit), parseInt(offset)]
    );
    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Failed to get transactions');
  }
};

// POST /api/wallet/withdraw
exports.withdraw = async (req, res) => {
  try {
    const { amount, pin } = req.body;
    const vendorId = req.user.userId;

    // Min withdrawal check (amount is in kobo)
    if (amount < MIN_WITHDRAWAL * 100) {
      return error(res, `Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}`, 400);
    }

    // Verify PIN
    const userResult = await query(
      `SELECT withdrawal_pin_hash FROM users WHERE id = $1`, [vendorId]
    );
    if (!userResult.rows[0]?.withdrawal_pin_hash) {
      return error(res, 'Please set your withdrawal PIN first', 400);
    }
    const pinValid = await bcrypt.compare(pin, userResult.rows[0].withdrawal_pin_hash);
    if (!pinValid) return error(res, 'Incorrect PIN', 401);

    // Check balance
    const walletResult = await query(
      `SELECT w.*, vp.bank_code, vp.bank_name, vp.account_number, vp.account_name
       FROM wallets w
       JOIN vendor_profiles vp ON vp.user_id = w.vendor_id
       WHERE w.vendor_id = $1`,
      [vendorId]
    );
    const wallet = walletResult.rows[0];

    if (!wallet) return error(res, 'Wallet not found', 404);
    if (wallet.available_balance < amount) return error(res, 'Insufficient balance', 400);
    if (!wallet.account_number) return error(res, 'No bank account linked. Complete KYC first.', 400);

    // Deduct from wallet immediately
    await query(
      `UPDATE wallets SET
        available_balance = available_balance - $1,
        total_withdrawn = total_withdrawn + $1,
        updated_at = NOW()
       WHERE vendor_id = $2`,
      [amount, vendorId]
    );

    // Record withdrawal
    const withdrawalResult = await query(
      `INSERT INTO withdrawals (vendor_id, amount, bank_code, bank_name, account_number, account_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
      [vendorId, amount, wallet.bank_code, wallet.bank_name, wallet.account_number, wallet.account_name]
    );

    // Record wallet transaction
    await query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, description)
       SELECT id, 'withdrawal', $1, $2 FROM wallets WHERE vendor_id = $3`,
      [amount, `Withdrawal to ${wallet.bank_name} ${wallet.account_number}`, vendorId]
    );

    // Try Paystack transfer (non-fatal if it fails)
    let transferCode = null;
    try {
      if (PAYSTACK_SECRET && !PAYSTACK_SECRET.includes('xxxx')) {
        // Create transfer recipient
        const recipientRes = await paystackAPI.post('/transferrecipient', {
          type: 'nuban',
          name: wallet.account_name,
          account_number: wallet.account_number,
          bank_code: wallet.bank_code,
          currency: 'NGN',
        });
        const recipientCode = recipientRes.data.data.recipient_code;

        // Initiate transfer
        const transferRes = await paystackAPI.post('/transfer', {
          source: 'balance',
          amount: amount,
          recipient: recipientCode,
          reason: 'Link earnings withdrawal',
        });
        transferCode = transferRes.data.data.transfer_code;

        await query(
          `UPDATE withdrawals SET paystack_transfer_code = $1, status = 'processing' WHERE id = $2`,
          [transferCode, withdrawalResult.rows[0].id]
        );
      }
    } catch (paystackErr) {
      // Log but don't fail — manual processing will handle it
      console.error('Paystack transfer failed:', paystackErr.message);
    }

    return success(res, {
      amount_formatted: `₦${(amount / 100).toLocaleString()}`,
      bank_name: wallet.bank_name,
      account_number: wallet.account_number,
      transfer_code: transferCode,
    }, 'Withdrawal initiated. Expect payment within 24 hours.');
  } catch (err) {
    return error(res, 'Withdrawal failed: ' + err.message);
  }
};
