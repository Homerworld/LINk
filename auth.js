const cron = require('node-cron');
const { query, getClient } = require('../config/database');
const { releaseFunds } = require('../controllers/jobController');
const logger = require('../utils/logger');

const init = () => {
  // Every 15 minutes — auto-release completed jobs past the window
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await query(
        `SELECT * FROM jobs WHERE status = 'completed' AND auto_release_at < NOW()`
      );
      for (const job of result.rows) {
        const client = await getClient();
        try {
          await client.query('BEGIN');
          await client.query(`UPDATE jobs SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1`, [job.id]);
          await releaseFunds(client, job);
          await client.query('COMMIT');
          logger.info(`Auto-released job: ${job.id}`);
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error('Auto-release failed for job ' + job.id + ': ' + err.message);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      logger.error('Auto-release cron error: ' + err.message);
    }
  });

  // Every 30 minutes — expire stale offers
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await query(
        `UPDATE offers SET status = 'expired', updated_at = NOW()
         WHERE status IN ('pending','countered') AND expires_at < NOW()
         RETURNING id`
      );
      if (result.rows.length > 0) {
        logger.info(`Expired ${result.rows.length} offers`);
      }
    } catch (err) {
      logger.error('Offer expiry cron error: ' + err.message);
    }
  });

  // Daily — clean up old OTPs
  cron.schedule('0 3 * * *', async () => {
    try {
      await query(`DELETE FROM otp_codes WHERE created_at < NOW() - INTERVAL '1 day'`);
    } catch (err) {
      logger.error('OTP cleanup error: ' + err.message);
    }
  });

  logger.info('Cron jobs initialized');
};

module.exports = { init };
