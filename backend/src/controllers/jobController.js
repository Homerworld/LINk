const { query, getClient } = require('../config/database');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

const COMPLETION_HOURS = parseInt(process.env.JOB_COMPLETION_WINDOW_HOURS) || 24;

// GET /api/jobs
exports.getMyJobs = async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const userId = req.user.userId;

    let sql = `
      SELECT j.*,
        c.full_name AS customer_name,
        v.full_name AS vendor_name,
        CASE WHEN j.customer_id = $1 THEN v.full_name ELSE c.full_name END AS other_party_name
      FROM jobs j
      JOIN users c ON c.id = j.customer_id
      JOIN users v ON v.id = j.vendor_id
      WHERE (j.customer_id = $1 OR j.vendor_id = $1)
    `;
    const params = [userId];

    if (status) {
      sql += ` AND j.status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY j.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Failed to get jobs');
  }
};

// GET /api/jobs/:id
exports.getJob = async (req, res) => {
  try {
    const result = await query(
      `SELECT j.*,
        c.full_name AS customer_name, c.phone AS customer_phone,
        v.full_name AS vendor_name, v.phone AS vendor_phone,
        d.id AS dispute_id, d.status AS dispute_status, d.issue AS dispute_issue
       FROM jobs j
       JOIN users c ON c.id = j.customer_id
       JOIN users v ON v.id = j.vendor_id
       LEFT JOIN disputes d ON d.job_id = j.id
       WHERE j.id = $1 AND (j.customer_id = $2 OR j.vendor_id = $2)`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) return error(res, 'Job not found', 404);
    return success(res, result.rows[0]);
  } catch (err) {
    return error(res, 'Failed to get job');
  }
};

// POST /api/jobs/:id/complete — vendor marks job complete
exports.markComplete = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.userId;

    const autoReleaseAt = new Date(Date.now() + COMPLETION_HOURS * 60 * 60 * 1000);

    const result = await query(
      `UPDATE jobs SET status = 'completed', completed_at = NOW(), auto_release_at = $1, updated_at = NOW()
       WHERE id = $2 AND vendor_id = $3 AND status = 'active'
       RETURNING *`,
      [autoReleaseAt, id, vendorId]
    );

    if (result.rows.length === 0) return error(res, 'Job not found or cannot be completed', 404);

    return success(res, result.rows[0], `Job marked complete. Customer has ${COMPLETION_HOURS} hours to confirm or dispute.`);
  } catch (err) {
    return error(res, 'Failed to mark job complete');
  }
};

// POST /api/jobs/:id/confirm — customer confirms completion
exports.confirmJob = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user.userId;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const jobResult = await client.query(
        `UPDATE jobs SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND customer_id = $2 AND status = 'completed'
         RETURNING *`,
        [id, customerId]
      );

      if (jobResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return error(res, 'Job not found or cannot be confirmed', 404);
      }

      const job = jobResult.rows[0];
      await releaseFunds(client, job);
      await client.query('COMMIT');

      return success(res, job, 'Job confirmed. Payment released to vendor.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return error(res, 'Failed to confirm job');
  }
};

// POST /api/jobs/:id/dispute — customer raises dispute
exports.raiseDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { issue, description } = req.body;
    const customerId = req.user.userId;

    const jobResult = await query(
      `SELECT * FROM jobs WHERE id = $1 AND customer_id = $2 AND status IN ('active','completed')`,
      [id, customerId]
    );
    if (jobResult.rows.length === 0) return error(res, 'Job not found or cannot be disputed', 404);

    const existing = await query(`SELECT id FROM disputes WHERE job_id = $1`, [id]);
    if (existing.rows.length > 0) return error(res, 'Dispute already raised for this job', 409);

    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await query(`UPDATE jobs SET status = 'disputed', updated_at = NOW() WHERE id = $1`, [id]);

    const result = await query(
      `INSERT INTO disputes (job_id, raised_by, issue, description, deadline_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, customerId, issue, description || null, deadline]
    );

    return success(res, result.rows[0], 'Dispute raised. Support will review within 48 hours.', 201);
  } catch (err) {
    return error(res, 'Failed to raise dispute');
  }
};

// POST /api/jobs/:id/review
exports.submitReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const userId = req.user.userId;

    const jobResult = await query(
      `SELECT * FROM jobs WHERE id = $1 AND (customer_id = $2 OR vendor_id = $2) AND status = 'confirmed'`,
      [id, userId]
    );
    if (jobResult.rows.length === 0) return error(res, 'Job not found or not yet confirmed', 404);

    const job = jobResult.rows[0];
    const isCustomer = job.customer_id === userId;

    if (isCustomer) {
      await query(
        `UPDATE jobs SET customer_rating = $1, customer_review = $2, updated_at = NOW() WHERE id = $3`,
        [rating, review || null, id]
      );
      // Update vendor avg rating
      await query(
        `UPDATE vendor_profiles SET
          avg_rating = (SELECT AVG(customer_rating) FROM jobs WHERE vendor_id = $1 AND customer_rating IS NOT NULL),
          total_reviews = (SELECT COUNT(*) FROM jobs WHERE vendor_id = $1 AND customer_rating IS NOT NULL),
          updated_at = NOW()
         WHERE user_id = $1`,
        [job.vendor_id]
      );
    } else {
      await query(
        `UPDATE jobs SET vendor_review = $1, updated_at = NOW() WHERE id = $2`,
        [review || null, id]
      );
    }

    return success(res, {}, 'Review submitted');
  } catch (err) {
    return error(res, 'Failed to submit review');
  }
};

// Internal — release funds to vendor wallet
const releaseFunds = async (client, job) => {
  await client.query(
    `UPDATE wallets SET
      available_balance = available_balance + $1,
      escrow_balance = GREATEST(0, escrow_balance - $1),
      total_earned = total_earned + $1,
      updated_at = NOW()
     WHERE vendor_id = $2`,
    [job.vendor_payout, job.vendor_id]
  );

  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, job_id, type, amount, description)
     SELECT id, $1, 'payout', $2, $3 FROM wallets WHERE vendor_id = $4`,
    [job.id, job.vendor_payout, `Payment for ${job.service_name}`, job.vendor_id]
  );

  await client.query(
    `UPDATE vendor_profiles SET
      total_jobs = total_jobs + 1,
      completion_rate = (
        SELECT (COUNT(*) FILTER (WHERE status = 'confirmed')::DECIMAL / NULLIF(COUNT(*),0)) * 100
        FROM jobs WHERE vendor_id = $1
      ),
      updated_at = NOW()
     WHERE user_id = $1`,
    [job.vendor_id]
  );
};

module.exports.releaseFunds = releaseFunds;
