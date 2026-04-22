const cron = require('node-cron');
const { query, getClient } = require('../config/database');
const { releasePayment } = require('../controllers/jobController');
const notificationService = require('../services/notificationService');
const uploadService = require('../services/uploadService');
const { formatNaira } = require('../utils/helpers');
const logger = require('../utils/logger');

// ── Auto-release payments after 24hr window ───────────────────────
const autoReleasePayments = async () => {
  try {
    const result = await query(
      `SELECT * FROM jobs
       WHERE status = 'completed_pending'
       AND auto_release_at <= NOW()`,
    );

    for (const job of result.rows) {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await releasePayment(client, job);
        await client.query('COMMIT');
        logger.info(`Auto-released payment for job ${job.reference}`);

        await notificationService.sendToUser(job.customer_id, {
          type: 'job_auto_released',
          title: 'Payment auto-released',
          body: `24 hours passed. Payment for job ${job.reference} was released to your vendor.`,
          data: { job_id: job.id },
        });
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Auto-release failed for job ${job.reference}`, err);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    logger.error('Auto-release cron error', err);
  }
};

// ── Send 12hr reminder before auto-release ────────────────────────
const sendCompletionReminders = async () => {
  try {
    const result = await query(
      `SELECT j.*, j.customer_id
       FROM jobs j
       WHERE j.status = 'completed_pending'
       AND j.auto_release_at BETWEEN NOW() + INTERVAL '11 hours' AND NOW() + INTERVAL '13 hours'
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = j.customer_id
         AND n.type = 'job_complete_reminder'
         AND n.data->>'job_id' = j.id::text
         AND n.created_at > NOW() - INTERVAL '24 hours'
       )`
    );

    for (const job of result.rows) {
      await notificationService.sendToUser(job.customer_id, {
        type: 'job_complete_reminder',
        title: '12 hours left to review',
        body: `You have 12 hours to confirm or dispute job ${job.reference} before payment is released.`,
        data: { job_id: job.id, job_reference: job.reference },
      });
    }
  } catch (err) {
    logger.error('Completion reminder cron error', err);
  }
};

// ── Expire pending offers ─────────────────────────────────────────
const expireOffers = async () => {
  try {
    const result = await query(
      `UPDATE offers SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND expires_at <= NOW()
       RETURNING job_id, offered_by`
    );

    for (const offer of result.rows) {
      // Get job details
      const jobResult = await query(
        'SELECT customer_id, vendor_id, reference FROM jobs WHERE id = $1',
        [offer.job_id]
      );
      const job = jobResult.rows[0];
      if (!job) continue;

      // Notify the party waiting for a response
      const notifyUserId = offer.offered_by === job.customer_id ? job.vendor_id : job.customer_id;
      await notificationService.sendToUser(notifyUserId, {
        type: 'offer_expiring',
        title: 'Offer expired',
        body: `An offer for job ${job.reference} has expired.`,
        data: { job_id: offer.job_id },
      });
    }

    if (result.rows.length > 0) {
      logger.info(`Expired ${result.rows.length} offers`);
    }
  } catch (err) {
    logger.error('Expire offers cron error', err);
  }
};

// ── Delete expired recordings (6 months) ─────────────────────────
const cleanExpiredRecordings = async () => {
  try {
    // Delete expired call recordings
    const expiredCalls = await query(
      `SELECT recording_key FROM job_calls
       WHERE expires_at <= NOW() AND recording_key IS NOT NULL`
    );

    for (const call of expiredCalls.rows) {
      await uploadService.deleteFromS3(call.recording_key);
      await query(
        'UPDATE job_calls SET recording_url = NULL, recording_key = NULL WHERE recording_key = $1',
        [call.recording_key]
      );
    }

    // Delete expired voice notes
    const expiredNotes = await query(
      `SELECT recording_key FROM voice_notes WHERE expires_at <= NOW()`
    );

    for (const note of expiredNotes.rows) {
      await uploadService.deleteFromS3(note.recording_key);
      await query(
        'DELETE FROM voice_notes WHERE recording_key = $1',
        [note.recording_key]
      );
    }

    if (expiredCalls.rows.length + expiredNotes.rows.length > 0) {
      logger.info(`Cleaned ${expiredCalls.rows.length} calls, ${expiredNotes.rows.length} voice notes`);
    }
  } catch (err) {
    logger.error('Clean recordings cron error', err);
  }
};

// ── Update vendor availability (based on their hours) ─────────────
const updateVendorAvailability = async () => {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentDay = now.getDay(); // 0=Sun
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;

    await query(
      `UPDATE vendor_profiles SET
         is_available_now = (
           $1 = ANY(available_days)
           AND available_from <= $2::TIME
           AND available_to >= $2::TIME
         ),
         updated_at = NOW()
       WHERE status = 'active'`,
      [currentDay, currentTime]
    );
  } catch (err) {
    logger.error('Update availability cron error', err);
  }
};

// ── Register all cron jobs ────────────────────────────────────────
exports.init = () => {
  // Every 5 minutes — check for auto-release
  cron.schedule('*/5 * * * *', autoReleasePayments);

  // Every 30 minutes — send 12hr reminders
  cron.schedule('*/30 * * * *', sendCompletionReminders);

  // Every 10 minutes — expire offers
  cron.schedule('*/10 * * * *', expireOffers);

  // Daily at 3am — clean expired recordings
  cron.schedule('0 3 * * *', cleanExpiredRecordings);

  // Every 15 minutes — update vendor availability
  cron.schedule('*/15 * * * *', updateVendorAvailability);

  logger.info('Cron jobs initialized');
};
