const { query, getClient } = require('../config/database');
const { success, error } = require('../utils/response');
const { releaseFunds } = require('./jobController');
const logger = require('../utils/logger');

// GET /api/admin/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const [kyc, disputes, jobs, revenue] = await Promise.all([
      query(`SELECT COUNT(*) AS count FROM vendor_profiles WHERE kyc_status = 'under_review'`),
      query(`SELECT COUNT(*) AS count FROM disputes WHERE status IN ('open','evidence_submitted','under_review')`),
      query(`SELECT COUNT(*) AS count FROM jobs WHERE created_at > NOW() - INTERVAL '1 day'`),
      query(`SELECT COALESCE(SUM(platform_fee), 0) AS total FROM jobs WHERE status = 'confirmed' AND updated_at > NOW() - INTERVAL '1 day'`),
    ]);

    const recentKyc = await query(
      `SELECT u.full_name, vp.id AS vendor_profile_id, vp.kyc_status, vp.kyc_submitted_at,
        array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS services
       FROM vendor_profiles vp
       JOIN users u ON u.id = vp.user_id
       LEFT JOIN vendor_services vs ON vs.vendor_profile_id = vp.id
       LEFT JOIN services s ON s.id = vs.service_id
       WHERE vp.kyc_status = 'under_review'
       GROUP BY u.full_name, vp.id
       ORDER BY vp.kyc_submitted_at ASC
       LIMIT 5`
    );

    return success(res, {
      stats: {
        pending_kyc: parseInt(kyc.rows[0].count),
        open_disputes: parseInt(disputes.rows[0].count),
        jobs_today: parseInt(jobs.rows[0].count),
        revenue_today_formatted: `₦${(parseInt(revenue.rows[0].total) / 100).toLocaleString()}`,
      },
      recent_kyc: recentKyc.rows,
    });
  } catch (err) {
    return error(res, 'Failed to get dashboard');
  }
};

// GET /api/admin/metrics
exports.getMetrics = async (req, res) => {
  try {
    const [gmv, platformRev, disputeRate, vendors, topServices] = await Promise.all([
      query(`SELECT COALESCE(SUM(agreed_amount), 0) AS total FROM jobs WHERE status = 'confirmed' AND updated_at > NOW() - INTERVAL '30 days'`),
      query(`SELECT COALESCE(SUM(platform_fee), 0) AS total FROM jobs WHERE status = 'confirmed' AND updated_at > NOW() - INTERVAL '30 days'`),
      query(`SELECT
        CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE d.id IS NOT NULL)::DECIMAL / COUNT(*)) * 100, 1)
        END AS rate
        FROM jobs j LEFT JOIN disputes d ON d.job_id = j.id
        WHERE j.created_at > NOW() - INTERVAL '30 days'`),
      query(`SELECT COUNT(*) AS count FROM vendor_profiles WHERE kyc_status = 'approved'`),
      query(`SELECT s.name, COUNT(j.id) AS job_count
        FROM jobs j JOIN offers o ON o.id = j.offer_id
        JOIN services s ON s.id = o.service_id
        WHERE j.created_at > NOW() - INTERVAL '30 days'
        GROUP BY s.name ORDER BY job_count DESC LIMIT 10`),
    ]);

    return success(res, {
      gmv_formatted: `₦${(parseInt(gmv.rows[0].total) / 100).toLocaleString()}`,
      platform_revenue_formatted: `₦${(parseInt(platformRev.rows[0].total) / 100).toLocaleString()}`,
      dispute_rate_percent: parseFloat(disputeRate.rows[0].rate),
      total_verified_vendors: parseInt(vendors.rows[0].count),
      top_services: topServices.rows,
    });
  } catch (err) {
    return error(res, 'Failed to get metrics');
  }
};

// GET /api/admin/kyc
exports.getKycQueue = async (req, res) => {
  try {
    const { status = 'under_review', limit = 50, offset = 0 } = req.query;
    const result = await query(
      `SELECT u.full_name, u.email, u.phone,
        vp.id AS vendor_profile_id, vp.kyc_status, vp.kyc_submitted_at,
        vp.id_type, vp.id_document_url, vp.selfie_url,
        vp.bvn_verified, vp.bank_name, vp.account_number, vp.account_name,
        vp.location_area, vp.kyc_rejection_reason,
        array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS services,
        COUNT(DISTINCT pi.id) AS image_count
       FROM vendor_profiles vp
       JOIN users u ON u.id = vp.user_id
       LEFT JOIN vendor_services vs ON vs.vendor_profile_id = vp.id
       LEFT JOIN services s ON s.id = vs.service_id
       LEFT JOIN portfolio_images pi ON pi.vendor_profile_id = vp.id
       WHERE vp.kyc_status = $1
       GROUP BY u.full_name, u.email, u.phone, vp.id
       ORDER BY vp.kyc_submitted_at ASC
       LIMIT $2 OFFSET $3`,
      [status, parseInt(limit), parseInt(offset)]
    );
    return success(res, { vendors: result.rows, total: result.rows.length });
  } catch (err) {
    return error(res, 'Failed to get KYC queue');
  }
};

// POST /api/admin/kyc/:id/review
exports.reviewKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      request_info: 'info_requested',
    };

    await query(
      `UPDATE vendor_profiles SET
        kyc_status = $1,
        kyc_reviewed_at = NOW(),
        kyc_rejection_reason = $2,
        updated_at = NOW()
       WHERE id = $3`,
      [statusMap[action], reason || null, id]
    );

    return success(res, {}, `KYC ${action}d`);
  } catch (err) {
    return error(res, 'Failed to review KYC');
  }
};

// GET /api/admin/disputes
exports.getDisputes = async (req, res) => {
  try {
    const result = await query(
      `SELECT d.id, d.issue, d.status, d.deadline_at,
        j.agreed_amount, j.service_name,
        c.full_name AS customer_name, v.full_name AS vendor_name,
        EXTRACT(EPOCH FROM (d.deadline_at - NOW())) / 3600 AS hours_remaining
       FROM disputes d
       JOIN jobs j ON j.id = d.job_id
       JOIN users c ON c.id = j.customer_id
       JOIN users v ON v.id = j.vendor_id
       WHERE d.status IN ('open','evidence_submitted','under_review')
       ORDER BY d.deadline_at ASC`
    );
    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Failed to get disputes');
  }
};

// POST /api/admin/disputes/:id/rule
exports.ruleDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { ruling, ruling_split, ruling_notes } = req.body;
    const adminId = req.user.userId;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const disputeResult = await client.query(
        `SELECT d.*, j.agreed_amount, j.vendor_payout, j.customer_id, j.vendor_id, j.service_name
         FROM disputes d JOIN jobs j ON j.id = d.job_id
         WHERE d.id = $1 AND d.status != 'resolved'`,
        [id]
      );

      if (disputeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return error(res, 'Dispute not found or already resolved', 404);
      }

      const dispute = disputeResult.rows[0];

      // Update dispute
      await client.query(
        `UPDATE disputes SET status = 'resolved', ruling = $1, ruling_split = $2, ruling_notes = $3, ruled_by = $4, ruled_at = NOW(), updated_at = NOW()
         WHERE id = $5`,
        [ruling, ruling_split || null, ruling_notes || null, adminId, id]
      );

      // Update job status
      await client.query(
        `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
        [ruling === 'full_refund' ? 'refunded' : 'confirmed', dispute.job_id]
      );

      // Handle fund distribution
      if (ruling === 'full_payment') {
        const job = { id: dispute.job_id, vendor_id: dispute.vendor_id, vendor_payout: dispute.vendor_payout, service_name: dispute.service_name };
        await releaseFunds(client, job);
      } else if (ruling === 'full_refund') {
        // Remove from escrow, no vendor payment
        await client.query(
          `UPDATE wallets SET escrow_balance = GREATEST(0, escrow_balance - $1), updated_at = NOW()
           WHERE vendor_id = $2`,
          [dispute.vendor_payout, dispute.vendor_id]
        );
      } else if (ruling === 'partial_split') {
        const vendorPct = 100 - (ruling_split || 50);
        const vendorAmount = Math.round(dispute.vendor_payout * vendorPct / 100);
        const job = { id: dispute.job_id, vendor_id: dispute.vendor_id, vendor_payout: vendorAmount, service_name: dispute.service_name };
        await releaseFunds(client, job);
      }

      await client.query('COMMIT');
      return success(res, {}, 'Dispute ruled');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return error(res, 'Failed to rule dispute');
  }
};

// GET /api/admin/vendors
exports.getVendors = async (req, res) => {
  try {
    const { search, status, limit = 50, offset = 0 } = req.query;
    let sql = `
      SELECT u.id, u.full_name, u.phone, u.email, u.is_active,
        vp.kyc_status AS status, vp.avg_rating, vp.total_jobs,
        vp.location_area,
        array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS services
       FROM users u
       JOIN vendor_profiles vp ON vp.user_id = u.id
       LEFT JOIN vendor_services vs ON vs.vendor_profile_id = vp.id
       LEFT JOIN services s ON s.id = vs.service_id
       WHERE u.role = 'vendor'
    `;
    const params = [];
    let idx = 1;

    if (search) {
      sql += ` AND (u.full_name ILIKE $${idx} OR u.phone ILIKE $${idx} OR u.email ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (status) {
      sql += ` AND vp.kyc_status = $${idx}`;
      params.push(status);
      idx++;
    }

    sql += ` GROUP BY u.id, u.full_name, u.phone, u.email, u.is_active, vp.kyc_status, vp.avg_rating, vp.total_jobs, vp.location_area`;
    sql += ` ORDER BY u.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Failed to get vendors');
  }
};

// POST /api/admin/vendors/:id/status
exports.updateVendorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const isActive = action === 'reinstate';
    await query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND role = 'vendor'`,
      [isActive, id]
    );

    return success(res, {}, `Vendor ${action}d`);
  } catch (err) {
    return error(res, 'Failed to update vendor status');
  }
};
