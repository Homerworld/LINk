const bcrypt = require('bcryptjs');
const { query, getClient } = require('../config/database');
const { success, error, notFound } = require('../utils/response');
const paystackService = require('../services/paystackService');
const notificationService = require('../services/notificationService');
const { formatNaira, paginate } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── Get Wallet ────────────────────────────────────────────────────
exports.getWallet = async (req, res) => {
  try {
    const result = await query(
      `SELECT vw.available_balance, vw.escrow_balance, vw.total_earned,
              kd.bank_name, kd.account_number, kd.account_name
       FROM vendor_wallets vw
       JOIN vendor_profiles vp ON vp.user_id = vw.vendor_id
       LEFT JOIN kyc_documents kd ON kd.vendor_id = vp.id
       WHERE vw.vendor_id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) return notFound(res, 'Wallet not found');

    const wallet = result.rows[0];
    return success(res, {
      available_balance: wallet.available_balance,
      available_balance_formatted: formatNaira(wallet.available_balance),
      escrow_balance: wallet.escrow_balance,
      escrow_balance_formatted: formatNaira(wallet.escrow_balance),
      total_earned: wallet.total_earned,
      total_earned_formatted: formatNaira(wallet.total_earned),
      bank_name: wallet.bank_name,
      account_number: wallet.account_number,
      account_name: wallet.account_name,
    }, 'Wallet retrieved');
  } catch (err) {
    logger.error('Get wallet error', err);
    return error(res, 'Failed to get wallet');
  }
};

// ── Withdraw Funds ────────────────────────────────────────────────
exports.withdraw = async (req, res) => {
  const client = await getClient();
  try {
    const { amount, pin } = req.body;
    const vendorId = req.user.id;
    const MIN_WITHDRAWAL = parseInt(process.env.MIN_WITHDRAWAL_AMOUNT || '2000') * 100; // to kobo

    // Verify PIN
    const userResult = await query(
      'SELECT withdrawal_pin_hash FROM users WHERE id = $1',
      [vendorId]
    );
    if (!userResult.rows[0]?.withdrawal_pin_hash) {
      return error(res, 'Please set a withdrawal PIN first', 400);
    }
    const pinValid = await bcrypt.compare(pin, userResult.rows[0].withdrawal_pin_hash);
    if (!pinValid) return error(res, 'Invalid PIN', 401);

    // Check minimum
    if (amount < MIN_WITHDRAWAL) {
      return error(res, `Minimum withdrawal is ${formatNaira(MIN_WITHDRAWAL)}`, 400);
    }

    // Check balance
    const walletResult = await query(
      'SELECT available_balance FROM vendor_wallets WHERE vendor_id = $1',
      [vendorId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet || wallet.available_balance < amount) {
      return error(res, 'Insufficient balance', 400);
    }

    // Get bank details from KYC
    const kycResult = await query(
      `SELECT kd.bank_name, kd.bank_code, kd.account_number, kd.account_name
       FROM kyc_documents kd
       JOIN vendor_profiles vp ON vp.id = kd.vendor_id
       WHERE vp.user_id = $1`,
      [vendorId]
    );

    if (!kycResult.rows[0]?.account_number) {
      return error(res, 'Bank account not found. Please complete KYC.', 400);
    }

    const { bank_name, bank_code, account_number, account_name } = kycResult.rows[0];
    const withdrawalRef = `LNK-WD-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

    await client.query('BEGIN');

    // Deduct from available balance
    await client.query(
      `UPDATE vendor_wallets SET
         available_balance = available_balance - $1,
         updated_at = NOW()
       WHERE vendor_id = $2`,
      [amount, vendorId]
    );

    // Record withdrawal
    const withdrawalResult = await client.query(
      `INSERT INTO withdrawals (vendor_id, amount, net_amount, bank_name, account_number, account_name, status)
       VALUES ($1, $2, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [vendorId, amount, bank_name, account_number, account_name]
    );

    // Record wallet transaction
    const newBalance = wallet.available_balance - amount;
    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, reference)
       VALUES ($1, 'withdrawal', $2, $3, $4, $5)`,
      [vendorId, amount, newBalance, `Withdrawal to ${bank_name} ${account_number}`, withdrawalRef]
    );

    await client.query('COMMIT');

    // Initiate Paystack transfer (async — don't block response)
    initiatePaystackTransfer({
      withdrawalId: withdrawalResult.rows[0].id,
      vendorId, amount, account_name, account_number, bank_code, withdrawalRef,
    }).catch(err => logger.error('Paystack transfer initiation failed', err));

    await notificationService.sendToUser(vendorId, {
      type: 'withdrawal_initiated',
      title: 'Withdrawal initiated',
      body: `${formatNaira(amount)} withdrawal to ${bank_name} is processing. Expect it within 24 hours.`,
    });

    return success(res, {
      withdrawal_id: withdrawalResult.rows[0].id,
      amount_formatted: formatNaira(amount),
      bank_name,
      account_number: `****${account_number.slice(-4)}`,
    }, 'Withdrawal initiated successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Withdraw error', err);
    return error(res, 'Withdrawal failed');
  } finally {
    client.release();
  }
};

const initiatePaystackTransfer = async ({ withdrawalId, vendorId, amount, account_name, account_number, bank_code, withdrawalRef }) => {
  const recipient = await paystackService.createTransferRecipient({ name: account_name, accountNumber: account_number, bankCode: bank_code });
  const transfer = await paystackService.initiateTransfer({
    amount, recipientCode: recipient.recipient_code,
    reference: withdrawalRef, reason: 'Link marketplace withdrawal',
  });

  await query(
    `UPDATE withdrawals SET status = 'processing', paystack_ref = $1, updated_at = NOW() WHERE id = $2`,
    [transfer.transfer_code, withdrawalId]
  );

  await notificationService.sendToUser(vendorId, {
    type: 'withdrawal_complete',
    title: 'Withdrawal successful',
    body: `Your withdrawal is on its way to your bank account.`,
  });
};

// ── Get Transactions ──────────────────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { limit, offset } = paginate(req.query.page, req.query.limit);
    const result = await query(
      `SELECT wt.type, wt.amount, wt.balance_after, wt.description, wt.created_at,
              j.reference as job_reference, s.name as service_name
       FROM wallet_transactions wt
       LEFT JOIN jobs j ON j.id = wt.job_id
       LEFT JOIN services s ON s.id = j.service_id
       WHERE wt.user_id = $1
       ORDER BY wt.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    return success(res, result.rows.map(t => ({
      ...t,
      amount_formatted: formatNaira(t.amount),
      balance_after_formatted: formatNaira(t.balance_after),
    })), 'Transactions retrieved');
  } catch (err) {
    return error(res, 'Failed to get transactions');
  }
};
