const { query, getClient } = require('../config/database');
const { success, error, notFound, forbidden } = require('../utils/response');
const paystackService = require('../services/paystackService');
const notificationService = require('../services/notificationService');
const { formatNaira } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── Initiate Payment ──────────────────────────────────────────────
exports.initiatePayment = async (req, res) => {
  try {
    const { job_id, method } = req.body;
    const customerId = req.user.id;

    const jobResult = await query(
      `SELECT j.*, u.email as customer_email, u.full_name as customer_name
       FROM jobs j JOIN users u ON u.id = j.customer_id
       WHERE j.id = $1 AND j.customer_id = $2 AND j.status = 'payment_pending'`,
      [job_id, customerId]
    );

    const job = jobResult.rows[0];
    if (!job) return notFound(res, 'Job not found or not ready for payment');

    const paystackRef = `LNK-PAY-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

    let paymentData = {};

    if (method === 'card') {
      const initialized = await paystackService.initializePayment({
        email: job.customer_email,
        amountKobo: job.agreed_amount,
        reference: paystackRef,
        metadata: {
          job_id: job.id,
          job_reference: job.reference,
          customer_id: customerId,
        },
      });
      paymentData = { authorization_url: initialized.authorization_url, reference: paystackRef };

    } else if (method === 'bank_transfer') {
      const virtualAccount = await paystackService.createVirtualAccount({
        customerId,
        name: job.customer_name,
        email: job.customer_email,
        jobReference: job.reference,
      });
      paymentData = {
        bank_name: virtualAccount.bank.name,
        account_number: virtualAccount.account_number,
        account_name: virtualAccount.account_name,
        amount: formatNaira(job.agreed_amount),
        reference: paystackRef,
        expires_in: '30 minutes',
      };
    }

    // Record pending payment
    await query(
      `INSERT INTO payments (job_id, customer_id, amount, method, status, paystack_ref)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [job_id, customerId, job.agreed_amount, method, paystackRef]
    );

    await query(
      `UPDATE jobs SET payment_method = $1, payment_reference = $2, updated_at = NOW()
       WHERE id = $3`,
      [method, paystackRef, job_id]
    );

    return success(res, paymentData, 'Payment initiated');
  } catch (err) {
    logger.error('Initiate payment error', err);
    return error(res, 'Failed to initiate payment');
  }
};

// ── Paystack Webhook ──────────────────────────────────────────────
exports.paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const isValid = paystackService.validateWebhook(
      JSON.stringify(req.body), signature
    );

    if (!isValid) {
      logger.warn('Invalid Paystack webhook signature');
      return res.status(400).json({ success: false });
    }

    const { event, data } = req.body;

    if (event === 'charge.success') {
      await handleSuccessfulPayment(data);
    }

    // Always respond 200 to Paystack immediately
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('Webhook error', err);
    return res.status(200).json({ success: true }); // Still 200 to prevent Paystack retries
  }
};

// ── Handle Successful Payment ─────────────────────────────────────
const handleSuccessfulPayment = async (data) => {
  const client = await getClient();
  try {
    const { reference, amount, metadata } = data;

    // Verify not already processed
    const existing = await query(
      "SELECT id, status FROM payments WHERE paystack_ref = $1",
      [reference]
    );
    if (!existing.rows[0] || existing.rows[0].status === 'successful') return;

    const jobId = metadata?.job_id || existing.rows[0].job_id;

    const jobResult = await query(
      `SELECT j.*, vp.user_id as vendor_user_id
       FROM jobs j
       JOIN vendor_profiles vp ON vp.user_id = j.vendor_id
       WHERE j.id = $1`,
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) return;

    await client.query('BEGIN');

    // Update payment to successful
    await client.query(
      `UPDATE payments SET status = 'successful', paystack_data = $1, updated_at = NOW()
       WHERE paystack_ref = $2`,
      [JSON.stringify(data), reference]
    );

    // Move job to in_escrow
    await client.query(
      `UPDATE jobs SET status = 'in_progress', call_enabled = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [job.id]
    );

    // Record escrow wallet transaction
    await client.query(
      `INSERT INTO wallet_transactions (user_id, job_id, type, amount, balance_after, description, reference)
       VALUES ($1, $2, 'escrow_in', $3, $3, $4, $5)`,
      [job.customer_id, job.id, amount, `Escrow for job ${job.reference}`, reference]
    );

    // Add to vendor escrow balance
    await client.query(
      `UPDATE vendor_wallets SET
         escrow_balance = escrow_balance + $1, updated_at = NOW()
       WHERE vendor_id = $2`,
      [job.vendor_payout, job.vendor_id]
    );

    await client.query('COMMIT');

    // Notify both parties
    await notificationService.sendToUser(job.customer_id, {
      type: 'payment_successful',
      title: 'Payment secured',
      body: `${formatNaira(amount)} is held securely. Ref: ${job.reference}`,
      data: { job_id: job.id, job_reference: job.reference },
    });

    await notificationService.sendToUser(job.vendor_id, {
      type: 'escrow_secured',
      title: `${formatNaira(job.vendor_payout)} secured in escrow`,
      body: `Payment confirmed for ${job.reference}. You can begin the job.`,
      data: { job_id: job.id, job_reference: job.reference },
    });

    logger.info(`Payment successful for job ${job.reference}`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Handle payment error', err);
  } finally {
    client.release();
  }
};

// ── Verify Payment (frontend polling fallback) ────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    const paymentResult = await query(
      `SELECT p.*, j.id as job_id, j.reference as job_reference, j.status as job_status
       FROM payments p JOIN jobs j ON j.id = p.job_id
       WHERE p.paystack_ref = $1 AND p.customer_id = $2`,
      [reference, req.user.id]
    );

    if (!paymentResult.rows[0]) return notFound(res, 'Payment not found');

    const payment = paymentResult.rows[0];

    // If still pending, check with Paystack directly
    if (payment.status === 'pending') {
      try {
        const paystackData = await paystackService.verifyTransaction(reference);
        if (paystackData.status === 'success') {
          await handleSuccessfulPayment(paystackData);
          payment.status = 'successful';
        }
      } catch (e) {
        // Paystack check failed, return current status
      }
    }

    return success(res, payment, 'Payment status retrieved');
  } catch (err) {
    logger.error('Verify payment error', err);
    return error(res, 'Failed to verify payment');
  }
};

// ── Get Banks List ────────────────────────────────────────────────
exports.getBanks = async (req, res) => {
  try {
    const banks = await paystackService.getBanks();
    return success(res, banks, 'Banks retrieved');
  } catch (err) {
    return error(res, 'Failed to fetch banks');
  }
};
