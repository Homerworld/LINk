const { query, getClient } = require('../config/database');
const { success, created, error, notFound, forbidden } = require('../utils/response');
const notificationService = require('../services/notificationService');
const uploadService = require('../services/uploadService');
const { releasePayment } = require('./jobController');
const { formatNaira, addHours } = require('../utils/helpers');
const logger = require('../utils/logger');

// ── Raise Dispute ─────────────────────────────────────────────────
exports.raiseDispute = async (req, res) => {
  const client = await getClient();
  try {
    const { job_id, issue } = req.body;
    const customerId = req.user.id;

    const jobResult = await query(
      `SELECT j.*, d.id as dispute_id
       FROM jobs j LEFT JOIN disputes d ON d.job_id = j.id
       WHERE j.id = $1 AND j.customer_id = $2`,
      [job_id, customerId]
    );

    const job = jobResult.rows[0];
    if (!job) return notFound(res, 'Job not found');
    if (job.status !== 'completed_pending') {
      return error(res, 'Disputes can only be raised on jobs awaiting confirmation', 400);
    }
    if (job.dispute_id) return error(res, 'A dispute already exists for this job', 409);

    // Check 24hr window
    if (job.completion_deadline && new Date() > new Date(job.completion_deadline)) {
      return error(res, 'The 24-hour dispute window has closed. Payment has been released.', 400);
    }

    const evidenceDeadline = addHours(new Date(), 24);

    await client.query('BEGIN');

    await client.query(
      "UPDATE jobs SET status = 'disputed', updated_at = NOW() WHERE id = $1",
      [job_id]
    );

    const disputeResult = await client.query(
      `INSERT INTO disputes (job_id, raised_by, issue, status, evidence_deadline)
       VALUES ($1, $2, $3, 'open', $4)
       RETURNING id`,
      [job_id, customerId, issue, evidenceDeadline]
    );

    await client.query('COMMIT');

    // Notify vendor
    await notificationService.sendToUser(job.vendor_id, {
      type: 'dispute_raised',
      title: 'Dispute raised against you',
      body: `A dispute has been raised for job ${job.reference}. Submit your evidence within 24 hours.`,
      data: { job_id: job.id, dispute_id: disputeResult.rows[0].id },
    });

    // Notify customer confirmation
    await notificationService.sendToUser(customerId, {
      type: 'dispute_raised',
      title: 'Dispute submitted',
      body: `Your dispute for ${job.reference} is under review. Please submit your evidence.`,
      data: { job_id: job.id, dispute_id: disputeResult.rows[0].id },
    });

    return created(res, {
      dispute_id: disputeResult.rows[0].id,
      evidence_deadline: evidenceDeadline,
    }, 'Dispute raised. Please submit your evidence.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Raise dispute error', err);
    return error(res, 'Failed to raise dispute');
  } finally {
    client.release();
  }
};

// ── Submit Evidence ───────────────────────────────────────────────
exports.submitEvidence = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const userId = req.user.id;

    if (!req.files || req.files.length === 0) {
      return error(res, 'No evidence files provided', 400);
    }

    const disputeResult = await query(
      `SELECT d.*, j.customer_id, j.vendor_id
       FROM disputes d JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [disputeId]
    );

    const dispute = disputeResult.rows[0];
    if (!dispute) return notFound(res, 'Dispute not found');
    if (dispute.customer_id !== userId && dispute.vendor_id !== userId) {
      return forbidden(res, 'Not your dispute');
    }
    if (dispute.status === 'resolved') {
      return error(res, 'This dispute has already been resolved', 400);
    }
    if (new Date() > new Date(dispute.evidence_deadline)) {
      return error(res, 'Evidence submission deadline has passed', 400);
    }

    const uploaded = [];
    for (const file of req.files) {
      const type = file.mimetype.startsWith('image/') ? 'photo'
        : file.mimetype.startsWith('video/') ? 'video' : 'voice_note';
      const { url, key } = await uploadService.uploadDisputeEvidence(file, userId, disputeId);

      await query(
        `INSERT INTO dispute_evidence (dispute_id, submitted_by, type, file_url, file_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [disputeId, userId, type, url, key]
      );
      uploaded.push({ type, url });
    }

    // Update dispute status
    await query(
      `UPDATE disputes SET status = 'evidence_submitted', updated_at = NOW() WHERE id = $1`,
      [disputeId]
    );

    return success(res, { uploaded }, 'Evidence submitted successfully');
  } catch (err) {
    logger.error('Submit evidence error', err);
    return error(res, 'Failed to submit evidence');
  }
};

// ── Get Dispute Details ───────────────────────────────────────────
exports.getDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const userId = req.user.id;

    const disputeResult = await query(
      `SELECT d.*,
              j.reference, j.agreed_amount, j.description, j.scheduled_at,
              j.customer_id, j.vendor_id,
              s.name as service_name,
              cu.full_name as customer_name,
              vu.full_name as vendor_name
       FROM disputes d
       JOIN jobs j ON j.id = d.job_id
       JOIN services s ON s.id = j.service_id
       JOIN users cu ON cu.id = j.customer_id
       JOIN users vu ON vu.id = j.vendor_id
       WHERE d.id = $1 AND (j.customer_id = $2 OR j.vendor_id = $2 OR $3 = 'admin')`,
      [disputeId, userId, req.user.role]
    );

    if (!disputeResult.rows[0]) return notFound(res, 'Dispute not found');

    const evidence = await query(
      `SELECT de.*, u.full_name as submitted_by_name
       FROM dispute_evidence de JOIN users u ON u.id = de.submitted_by
       WHERE de.dispute_id = $1 ORDER BY de.created_at ASC`,
      [disputeId]
    );

    // Get call recordings and voice notes for this job
    const calls = await query(
      `SELECT id, duration_secs, recording_url, started_at, ended_at
       FROM job_calls WHERE job_id = $1 ORDER BY started_at ASC`,
      [disputeResult.rows[0].job_id]
    );

    const voiceNotes = await query(
      `SELECT vn.id, vn.duration_secs, vn.recording_url, vn.created_at,
              u.full_name as sent_by_name
       FROM voice_notes vn JOIN users u ON u.id = vn.sent_by
       WHERE vn.job_id = $1 ORDER BY vn.created_at ASC`,
      [disputeResult.rows[0].job_id]
    );

    return success(res, {
      dispute: disputeResult.rows[0],
      evidence: evidence.rows,
      call_recordings: calls.rows,
      voice_notes: voiceNotes.rows,
    }, 'Dispute details retrieved');
  } catch (err) {
    logger.error('Get dispute error', err);
    return error(res, 'Failed to get dispute');
  }
};
