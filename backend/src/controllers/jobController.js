const { query, getClient } = require('../config/database');
const { success, error, notFound, forbidden } = require('../utils/response');
const notificationService = require('../services/notificationService');
const { addHours, formatNaira } = require('../utils/helpers');
const logger = require('../utils/logger');

const COMPLETION_WINDOW_HOURS = parseInt(process.env.JOB_COMPLETION_WINDOW_HOURS || '24');

// ── Get My Jobs ───────────────────────────────────────────────────
exports.getMyJobs = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const userId = req.user.id;
    const role = req.user.role;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [role === 'customer' ? 'j.customer_id = $1' : 'j.vendor_id = $1'];
    const params = [userId];

    if (status) {
      conditions.push(`j.status = $${params.length + 1}`);
      params.push(status);
    }

    const result = await query(
      `SELECT
         j.id, j.reference, j.status, j.agreed_amount, j.created_at,
         j.scheduled_at, j.completion_deadline, j.auto_release_at,
         s.name as service_name,
         ${role === 'customer'
           ? `u.full_name as other_party_name, u.profile_photo_url as other_party_photo,
              (SELECT pi.image_url FROM portfolio_images pi
               JOIN vendor_profiles vp ON vp.id = pi.vendor_id
               WHERE vp.user_id = u.id AND pi.is_cover = TRUE LIMIT 1) as cover_image`
           : `u.full_name as other_party_name, u.profile_photo_url as other_party_photo`}
       FROM jobs j
       JOIN services s ON s.id = j.service_id
       JOIN users u ON u.id = ${role === 'customer' ? 'j.vendor_id' : 'j.customer_id'}
       WHERE ${conditions.join(' AND ')}
       ORDER BY j.updated_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    return success(res, result.rows, 'Jobs retrieved');
  } catch (err) {
    logger.error('Get jobs error', err);
    return error(res, 'Failed to get jobs');
  }
};

// ── Get Single Job ────────────────────────────────────────────────
exports.getJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const result = await query(
      `SELECT
         j.*,
         s.name as service_name,
         cu.full_name as customer_name, cu.profile_photo_url as customer_photo,
         vu.full_name as vendor_name, vu.profile_photo_url as vendor_photo,
         vp.business_name, vp.avg_rating,
         (SELECT json_agg(json_build_object('id', pi.id, 'url', pi.image_url, 'is_cover', pi.is_cover))
          FROM portfolio_images pi WHERE pi.vendor_id = vp.id) as vendor_portfolio
       FROM jobs j
       JOIN services s ON s.id = j.service_id
       JOIN users cu ON cu.id = j.customer_id
       JOIN users vu ON vu.id = j.vendor_id
       JOIN vendor_profiles vp ON vp.user_id = j.vendor_id
       WHERE j.id = $1 AND (j.customer_id = $2 OR j.vendor_id = $2)`,
      [jobId, userId]
    );

    if (!result.rows[0]) return notFound(res, 'Job not found');

    return success(res, result.rows[0], 'Job retrieved');
  } catch (err) {
    logger.error('Get job error', err);
    return error(res, 'Failed to get job');
  }
};

// ── Vendor marks job complete ─────────────────────────────────────
exports.markComplete = async (req, res) => {
  const client = await getClient();
  try {
    const { jobId } = req.params;
    const vendorId = req.user.id;

    const jobResult = await query(
      'SELECT * FROM jobs WHERE id = $1 AND vendor_id = $2',
      [jobId, vendorId]
    );

    const job = jobResult.rows[0];
    if (!job) return notFound(res, 'Job not found');
    if (job.status !== 'in_progress') {
      return error(res, 'Job must be in progress to mark as complete', 400);
    }

    const now = new Date();
    const completionDeadline = addHours(now, COMPLETION_WINDOW_HOURS);
    const autoReleaseAt = completionDeadline;

    await client.query('BEGIN');

    await client.query(
      `UPDATE jobs SET
         status = 'completed_pending',
         completed_at = NOW(),
         completion_deadline = $1,
         auto_release_at = $2,
         updated_at = NOW()
       WHERE id = $3`,
      [completionDeadline, autoReleaseAt, jobId]
    );

    await client.query('COMMIT');

    // Notify customer
    await notificationService.sendToUser(job.customer_id, {
      type: 'job_complete_pending',
      title: 'Job marked complete',
      body: `Your vendor has marked the job complete. You have 24 hours to confirm or raise a dispute.`,
      data: { job_id: job.id, job_reference: job.reference, deadline: completionDeadline },
    });

    return success(res, { completion_deadline: completionDeadline }, 'Job marked complete. Awaiting customer confirmation.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Mark complete error', err);
    return error(res, 'Failed to mark job complete');
  } finally {
    client.release();
  }
};

// ── Customer confirms completion ──────────────────────────────────
exports.confirmComplete = async (req, res) => {
  const client = await getClient();
  try {
    const { jobId } = req.params;
    const customerId = req.user.id;

    const jobResult = await query(
      'SELECT * FROM jobs WHERE id = $1 AND customer_id = $2',
      [jobId, customerId]
    );

    const job = jobResult.rows[0];
    if (!job) return notFound(res, 'Job not found');
    if (job.status !== 'completed_pending') {
      return error(res, 'Job is not awaiting confirmation', 400);
    }

    await client.query('BEGIN');
    await releasePayment(client, job);
    await client.query('COMMIT');

    return success(res, {}, 'Job confirmed. Payment released to vendor.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Confirm complete error', err);
    return error(res, 'Failed to confirm completion');
  } finally {
    client.release();
  }
};

// ── Release payment (shared by confirm + auto-release) ────────────
const releasePayment = async (client, job) => {
  // Update job
  await client.query(
    `UPDATE jobs SET status = 'completed', updated_at = NOW() WHERE id = $1`,
    [job.id]
  );

  // Move from escrow to available balance
  await client.query(
    `UPDATE vendor_wallets SET
       escrow_balance = GREATEST(0, escrow_balance - $1),
       available_balance = available_balance + $1,
       total_earned = total_earned + $1,
       updated_at = NOW()
     WHERE vendor_id = $2`,
    [job.vendor_payout, job.vendor_id]
  );

  // Record wallet transactions
  await client.query(
    `INSERT INTO wallet_transactions (user_id, job_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'payout', $3, $3, $4)`,
    [job.vendor_id, job.id, job.vendor_payout, `Payment for job ${job.reference}`]
  );

  // Update vendor stats
  await client.query(
    `UPDATE vendor_profiles SET
       total_jobs = total_jobs + 1,
       updated_at = NOW()
     WHERE user_id = $1`,
    [job.vendor_id]
  );

  // Close communication channel
  await client.query(
    'UPDATE jobs SET call_enabled = FALSE, updated_at = NOW() WHERE id = $1',
    [job.id]
  );

  // Notify vendor
  await notificationService.sendToUser(job.vendor_id, {
    type: 'job_auto_released',
    title: 'Payment released!',
    body: `${formatNaira(job.vendor_payout)} is now in your wallet. Well done!`,
    data: { job_id: job.id, job_reference: job.reference },
  });

  // Notify customer to rate
  await notificationService.sendToUser(job.customer_id, {
    type: 'new_review',
    title: 'How was your experience?',
    body: 'Take a moment to rate your vendor.',
    data: { job_id: job.id },
  });
};

exports.releasePayment = releasePayment;

// ── Submit Review ─────────────────────────────────────────────────
exports.submitReview = async (req, res) => {
  const client = await getClient();
  try {
    const { job_id, rating, comment } = req.body;
    const customerId = req.user.id;

    const jobResult = await query(
      `SELECT j.*, r.id as review_id
       FROM jobs j
       LEFT JOIN reviews r ON r.job_id = j.id
       WHERE j.id = $1 AND j.customer_id = $2 AND j.status = 'completed'`,
      [job_id, customerId]
    );

    const job = jobResult.rows[0];
    if (!job) return notFound(res, 'Completed job not found');
    if (job.review_id) return error(res, 'You have already reviewed this job', 409);

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO reviews (job_id, customer_id, vendor_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [job_id, customerId, job.vendor_id, rating, comment]
    );

    // Recalculate vendor average rating
    const ratingResult = await client.query(
      'SELECT AVG(rating)::DECIMAL(3,2) as avg, COUNT(*) as total FROM reviews WHERE vendor_id = $1',
      [job.vendor_id]
    );

    await client.query(
      `UPDATE vendor_profiles SET
         avg_rating = $1, total_reviews = $2, updated_at = NOW()
       WHERE user_id = $3`,
      [ratingResult.rows[0].avg, ratingResult.rows[0].total, job.vendor_id]
    );

    await client.query('COMMIT');

    await notificationService.sendToUser(job.vendor_id, {
      type: 'new_review',
      title: 'New review received',
      body: `You received a ${rating}-star review for job ${job.reference}`,
      data: { job_id: job.id },
    });

    return success(res, {}, 'Review submitted. Thank you!');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Submit review error', err);
    return error(res, 'Failed to submit review');
  } finally {
    client.release();
  }
};
