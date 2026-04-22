const { query, getClient } = require('../config/database');
const { success, error, notFound } = require('../utils/response');
const notificationService = require('../services/notificationService');
const { releasePayment } = require('./jobController');
const { formatNaira } = require('../utils/helpers');
const logger = require('../utils/logger');

// ── Dashboard Overview ────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const [kycPending, openDisputes, jobsToday, revenueToday, recentKyc] = await Promise.all([
      query(`SELECT COUNT(*) FROM vendor_profiles WHERE kyc_status = 'under_review'`),
      query(`SELECT COUNT(*) FROM disputes WHERE status != 'resolved'`),
      query(`SELECT COUNT(*) FROM jobs WHERE DATE(created_at) = CURRENT_DATE AND status != 'cancelled'`),
      query(`SELECT COALESCE(SUM(platform_fee), 0) as total FROM jobs WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed'`),
      query(`
        SELECT vp.kyc_status, vp.updated_at, u.full_name,
               (SELECT s.name FROM vendor_services vs JOIN services s ON s.id = vs.service_id WHERE vs.vendor_id = vp.id LIMIT 1) as primary_service
        FROM vendor_profiles vp JOIN users u ON u.id = vp.user_id
        WHERE vp.kyc_status = 'under_review'
        ORDER BY vp.updated_at ASC LIMIT 5`),
    ]);

    return success(res, {
      stats: {
        pending_kyc: parseInt(kycPending.rows[0].count),
        open_disputes: parseInt(openDisputes.rows[0].count),
        jobs_today: parseInt(jobsToday.rows[0].count),
        revenue_today: parseInt(revenueToday.rows[0].total),
        revenue_today_formatted: formatNaira(parseInt(revenueToday.rows[0].total)),
      },
      recent_kyc: recentKyc.rows,
    }, 'Dashboard data retrieved');
  } catch (err) {
    logger.error('Admin dashboard error', err);
    return error(res, 'Failed to load dashboard');
  }
};

// ── KYC Queue ─────────────────────────────────────────────────────
exports.getKycQueue = async (req, res) => {
  try {
    const { status = 'under_review', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await query(
      `SELECT
         vp.id as vendor_profile_id, vp.kyc_status, vp.updated_at,
         u.id as user_id, u.full_name, u.email, u.phone,
         vp.business_name, vp.location_area,
         (SELECT array_agg(s.name) FROM vendor_services vs JOIN services s ON s.id = vs.service_id WHERE vs.vendor_id = vp.id) as services,
         (SELECT COUNT(*) FROM portfolio_images WHERE vendor_id = vp.id) as image_count,
         kd.id_type, kd.id_document_url, kd.selfie_url,
         kd.bvn IS NOT NULL as has_bvn,
         kd.account_number, kd.account_name, kd.bank_name
       FROM vendor_profiles vp
       JOIN users u ON u.id = vp.user_id
       LEFT JOIN kyc_documents kd ON kd.vendor_id = vp.id
       WHERE vp.kyc_status = $1
       ORDER BY vp.updated_at ASC
       LIMIT $2 OFFSET $3`,
      [status, parseInt(limit), offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM vendor_profiles WHERE kyc_status = $1',
      [status]
    );

    return success(res, {
      vendors: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
    }, 'KYC queue retrieved');
  } catch (err) {
    logger.error('KYC queue error', err);
    return error(res, 'Failed to get KYC queue');
  }
};

// ── Review KYC ────────────────────────────────────────────────────
exports.reviewKyc = async (req, res) => {
  const client = await getClient();
  try {
    const { vendorId } = req.params;
    const { action, reason } = req.body; // action: 'approve' | 'reject' | 'request_info'
    const adminId = req.user.id;

    const vendorResult = await query(
      `SELECT vp.*, u.id as user_id, u.full_name
       FROM vendor_profiles vp JOIN users u ON u.id = vp.user_id
       WHERE vp.id = $1`,
      [vendorId]
    );

    if (!vendorResult.rows[0]) return notFound(res, 'Vendor not found');
    const vendor = vendorResult.rows[0];

    await client.query('BEGIN');

    if (action === 'approve') {
      await client.query(
        `UPDATE vendor_profiles SET
           kyc_status = 'approved', status = 'active',
           kyc_reviewed_by = $1, kyc_reviewed_at = NOW(),
           verified_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [adminId, vendorId]
      );

      await notificationService.sendToUser(vendor.user_id, {
        type: 'kyc_approved',
        title: 'You are verified!',
        body: 'Your profile is now live. Customers can find you on Link.',
      });

    } else if (action === 'reject') {
      if (!reason) return error(res, 'Rejection reason is required', 400);

      await client.query(
        `UPDATE vendor_profiles SET
           kyc_status = 'rejected', kyc_reviewed_by = $1,
           kyc_reviewed_at = NOW(), kyc_rejection_reason = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [adminId, reason, vendorId]
      );

      await notificationService.sendToUser(vendor.user_id, {
        type: 'kyc_rejected',
        title: 'KYC not approved',
        body: `Your verification was not approved. Reason: ${reason}`,
        data: { reason },
      });

    } else if (action === 'request_info') {
      if (!reason) return error(res, 'Please specify what information is needed', 400);

      await client.query(
        `UPDATE vendor_profiles SET
           kyc_status = 'info_requested', kyc_reviewed_by = $1,
           kyc_reviewed_at = NOW(), kyc_rejection_reason = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [adminId, reason, vendorId]
      );

      await notificationService.sendToUser(vendor.user_id, {
        type: 'kyc_info_requested',
        title: 'Additional information needed',
        body: `Please resubmit: ${reason}`,
        data: { reason },
      });
    } else {
      await client.query('ROLLBACK');
      return error(res, 'Invalid action', 400);
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'vendor_profile', $3, $4)`,
      [adminId, `kyc_${action}`, vendorId, JSON.stringify({ reason })]
    );

    await client.query('COMMIT');
    return success(res, {}, `KYC ${action} successful`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Review KYC error', err);
    return error(res, 'Failed to review KYC');
  } finally {
    client.release();
  }
};

// ── Dispute Queue ─────────────────────────────────────────────────
exports.getDisputeQueue = async (req, res) => {
  try {
    const { status = 'open', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await query(
      `SELECT
         d.id, d.issue, d.status, d.created_at, d.evidence_deadline,
         j.reference, j.agreed_amount,
         cu.full_name as customer_name,
         vu.full_name as vendor_name,
         s.name as service_name,
         EXTRACT(EPOCH FROM (d.evidence_deadline - NOW()))/3600 as hours_remaining
       FROM disputes d
       JOIN jobs j ON j.id = d.job_id
       JOIN services s ON s.id = j.service_id
       JOIN users cu ON cu.id = j.customer_id
       JOIN users vu ON vu.id = j.vendor_id
       WHERE d.status = ANY($1::text[])
       ORDER BY d.created_at ASC
       LIMIT $2 OFFSET $3`,
      [status === 'open' ? ['open', 'evidence_submitted', 'under_review'] : [status],
       parseInt(limit), offset]
    );

    return success(res, result.rows, 'Dispute queue retrieved');
  } catch (err) {
    return error(res, 'Failed to get dispute queue');
  }
};

// ── Rule on Dispute ───────────────────────────────────────────────
exports.ruleDispute = async (req, res) => {
  const client = await getClient();
  try {
    const { disputeId } = req.params;
    const { ruling, ruling_split, ruling_notes } = req.body;
    const adminId = req.user.id;

    const disputeResult = await query(
      `SELECT d.*, j.agreed_amount, j.vendor_payout, j.customer_id, j.vendor_id,
              j.reference, j.id as job_id
       FROM disputes d JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1 AND d.status != 'resolved'`,
      [disputeId]
    );

    const dispute = disputeResult.rows[0];
    if (!dispute) return notFound(res, 'Dispute not found or already resolved');

    await client.query('BEGIN');

    await client.query(
      `UPDATE disputes SET
         ruling = $1, ruling_split = $2, ruling_notes = $3,
         status = 'resolved', reviewed_by = $4, reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $5`,
      [ruling, ruling_split || null, ruling_notes, adminId, disputeId]
    );

    const job = dispute;

    if (ruling === 'full_refund') {
      // Refund customer — deduct from vendor escrow
      await client.query(
        `UPDATE vendor_wallets SET
           escrow_balance = GREATEST(0, escrow_balance - $1),
           updated_at = NOW()
         WHERE vendor_id = $2`,
        [job.vendor_payout, job.vendor_id]
      );
      await client.query(
        "UPDATE jobs SET status = 'refunded', updated_at = NOW() WHERE id = $1",
        [job.job_id]
      );
      await notificationService.sendToUser(job.customer_id, {
        type: 'dispute_ruled',
        title: 'Dispute resolved in your favour',
        body: `Full refund of ${formatNaira(job.agreed_amount)} has been processed.`,
        data: { job_id: job.job_id },
      });
      await notificationService.sendToUser(job.vendor_id, {
        type: 'dispute_ruled',
        title: 'Dispute resolved',
        body: `The dispute for job ${job.reference} was resolved in the customer's favour.`,
        data: { job_id: job.job_id },
      });

    } else if (ruling === 'full_payment') {
      // Release to vendor
      const fakeJob = { ...job, id: job.job_id };
      await releasePayment(client, fakeJob);

    } else if (ruling === 'partial_split') {
      const customerPercent = ruling_split; // customer gets this %
      const vendorPercent = 100 - customerPercent;
      const vendorAmount = Math.round(job.vendor_payout * (vendorPercent / 100));
      const customerAmount = job.agreed_amount - vendorAmount;

      // Release vendor portion
      await client.query(
        `UPDATE vendor_wallets SET
           escrow_balance = GREATEST(0, escrow_balance - $1),
           available_balance = available_balance + $2,
           total_earned = total_earned + $2,
           updated_at = NOW()
         WHERE vendor_id = $3`,
        [job.vendor_payout, vendorAmount, job.vendor_id]
      );
      await client.query(
        "UPDATE jobs SET status = 'completed', updated_at = NOW() WHERE id = $1",
        [job.job_id]
      );

      await notificationService.sendToUser(job.customer_id, {
        type: 'dispute_ruled',
        title: 'Dispute resolved',
        body: `You will receive a ${customerPercent}% refund of ${formatNaira(customerAmount)}.`,
        data: { job_id: job.job_id },
      });
      await notificationService.sendToUser(job.vendor_id, {
        type: 'dispute_ruled',
        title: 'Dispute resolved',
        body: `${formatNaira(vendorAmount)} (${vendorPercent}%) has been released to your wallet.`,
        data: { job_id: job.job_id },
      });
    }

    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'dispute_ruled', 'dispute', $2, $3)`,
      [adminId, disputeId, JSON.stringify({ ruling, ruling_split, ruling_notes })]
    );

    await client.query('COMMIT');
    return success(res, {}, 'Dispute ruled successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Rule dispute error', err);
    return error(res, 'Failed to rule on dispute');
  } finally {
    client.release();
  }
};

// ── Vendor Management ─────────────────────────────────────────────
exports.getVendors = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ["u.role = 'vendor'"];

    if (status) {
      params.push(status);
      conditions.push(`vp.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
              vp.status, vp.kyc_status, vp.avg_rating, vp.total_jobs,
              vp.verified_at, vp.location_area,
              (SELECT array_agg(s.name) FROM vendor_services vs JOIN services s ON s.id = vs.service_id WHERE vs.vendor_id = vp.id) as services
       FROM users u JOIN vendor_profiles vp ON vp.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    return success(res, result.rows, 'Vendors retrieved');
  } catch (err) {
    return error(res, 'Failed to get vendors');
  }
};

// ── Suspend / Ban Vendor ──────────────────────────────────────────
exports.updateVendorStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { action, reason } = req.body; // action: 'suspend' | 'ban' | 'reinstate'
    const adminId = req.user.id;

    const statusMap = { suspend: 'suspended', ban: 'banned', reinstate: 'active' };
    const newStatus = statusMap[action];
    if (!newStatus) return error(res, 'Invalid action', 400);

    const vendorResult = await query(
      'SELECT vp.*, u.id as user_id FROM vendor_profiles vp JOIN users u ON u.id = vp.user_id WHERE u.id = $1',
      [vendorId]
    );
    if (!vendorResult.rows[0]) return notFound(res, 'Vendor not found');

    await query(
      `UPDATE vendor_profiles SET status = $1, updated_at = NOW() WHERE user_id = $2`,
      [newStatus, vendorId]
    );

    if (action === 'ban') {
      await query('UPDATE users SET is_active = FALSE WHERE id = $1', [vendorId]);
    }

    await query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'user', $3, $4)`,
      [adminId, `vendor_${action}`, vendorId, JSON.stringify({ reason })]
    );

    await notificationService.sendToUser(vendorId, {
      type: 'kyc_rejected',
      title: action === 'reinstate' ? 'Account reinstated' : `Account ${action}ed`,
      body: action === 'reinstate'
        ? 'Your account has been reinstated. Welcome back.'
        : `Your account has been ${action}ed. ${reason || 'Contact support for details.'}`,
    });

    return success(res, {}, `Vendor ${action}ed successfully`);
  } catch (err) {
    logger.error('Update vendor status error', err);
    return error(res, 'Failed to update vendor status');
  }
};

// ── Platform Metrics ──────────────────────────────────────────────
exports.getMetrics = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const [gmv, revenue, disputeRate, topServices, vendorCount, customerCount] = await Promise.all([
      query(`SELECT COALESCE(SUM(agreed_amount), 0) as total FROM jobs WHERE status = 'completed' AND created_at > NOW() - INTERVAL '${period} days'`),
      query(`SELECT COALESCE(SUM(platform_fee), 0) as total FROM jobs WHERE status = 'completed' AND created_at > NOW() - INTERVAL '${period} days'`),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'disputed' OR EXISTS (SELECT 1 FROM disputes WHERE job_id = jobs.id)) as disputed,
          COUNT(*) FILTER (WHERE status IN ('completed', 'disputed')) as total
        FROM jobs WHERE created_at > NOW() - INTERVAL '${period} days'`),
      query(`
        SELECT s.name, COUNT(j.id) as job_count
        FROM jobs j JOIN services s ON s.id = j.service_id
        WHERE j.created_at > NOW() - INTERVAL '${period} days'
        GROUP BY s.name ORDER BY job_count DESC LIMIT 10`),
      query(`SELECT COUNT(*) FROM vendor_profiles WHERE kyc_status = 'approved'`),
      query(`SELECT COUNT(*) FROM users WHERE role = 'customer'`),
    ]);

    const disputed = parseInt(disputeRate.rows[0].disputed);
    const total = parseInt(disputeRate.rows[0].total);
    const disputeRatePercent = total > 0 ? ((disputed / total) * 100).toFixed(2) : '0.00';

    return success(res, {
      period_days: parseInt(period),
      gmv: parseInt(gmv.rows[0].total),
      gmv_formatted: formatNaira(parseInt(gmv.rows[0].total)),
      platform_revenue: parseInt(revenue.rows[0].total),
      platform_revenue_formatted: formatNaira(parseInt(revenue.rows[0].total)),
      dispute_rate_percent: parseFloat(disputeRatePercent),
      top_services: topServices.rows,
      total_verified_vendors: parseInt(vendorCount.rows[0].count),
      total_customers: parseInt(customerCount.rows[0].count),
    }, 'Metrics retrieved');
  } catch (err) {
    logger.error('Metrics error', err);
    return error(res, 'Failed to get metrics');
  }
};

// ── Service Master List ───────────────────────────────────────────
exports.getPendingServices = async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, u.full_name as suggested_by_name
       FROM services s LEFT JOIN users u ON u.id = s.suggested_by
       WHERE s.is_approved = FALSE ORDER BY s.created_at ASC`
    );
    return success(res, result.rows, 'Pending services retrieved');
  } catch (err) {
    return error(res, 'Failed to get pending services');
  }
};

exports.approveService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { action } = req.body; // 'approve' | 'reject'

    if (action === 'approve') {
      await query(
        'UPDATE services SET is_approved = TRUE, approved_by = $1 WHERE id = $2',
        [req.user.id, serviceId]
      );
      return success(res, {}, 'Service approved');
    } else {
      await query('DELETE FROM services WHERE id = $1 AND is_approved = FALSE', [serviceId]);
      return success(res, {}, 'Service rejected and removed');
    }
  } catch (err) {
    return error(res, 'Failed to update service');
  }
};
