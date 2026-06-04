require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Health check — always first, always responds ──────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// ── Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(morgan('tiny', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Start server immediately so health check passes ───────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Link API listening on port ${PORT}`);
  bootAsync();
});

async function bootAsync() {
  try {
    // Init Firebase
    const { initFirebase } = require('./config/firebase');
    initFirebase();
    logger.info('Firebase connected');

    // Run setup (seed admin + services)
    const setup = require('./config/setup');
    await setup();

    // Mount all routes
    const { authRouter, searchRouter, offerRouter, paymentRouter, jobRouter, walletRouter, kycRouter, adminRouter } = require('./routes/index');
    app.use('/api/auth', authRouter);
    app.use('/api/search', searchRouter);
    app.use('/api/offers', offerRouter);
    app.use('/api/payments', paymentRouter);
    app.use('/api/jobs', jobRouter);
    app.use('/api/wallet', walletRouter);
    app.use('/api/kyc', kycRouter);
    app.use('/api/admin', adminRouter);

    // 404
    app.use((req, res) => res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.path}` }));
    // Error
    app.use((err, req, res, next) => {
      logger.error('Error: ' + err.message);
      res.status(500).json({ success: false, message: 'Internal server error' });
    });

    // Start cron jobs
    const cron = require('node-cron');
    const { queryDocs, updateDoc } = require('./config/firebase');
    const { releaseFunds } = require('./controllers/jobController');

    // Auto-release completed jobs every 15 mins
    cron.schedule('*/15 * * * *', async () => {
      try {
        const jobs = await queryDocs('jobs', [['status', '==', 'completed']]);
        const due = jobs.filter(j => j.autoReleaseAt && new Date(j.autoReleaseAt) < new Date());
        for (const job of due) {
          await updateDoc('jobs', job.id, { status: 'confirmed', confirmedAt: new Date().toISOString() });
          await releaseFunds(job);
          logger.info(`Auto-released job: ${job.id}`);
        }
      } catch (err) { logger.error('Auto-release error: ' + err.message); }
    });

    // Expire stale offers every 30 mins
    cron.schedule('*/30 * * * *', async () => {
      try {
        const offers = await queryDocs('offers', [['status', 'in', ['pending', 'countered']]]);
        const expired = offers.filter(o => new Date(o.expiresAt) < new Date());
        for (const offer of expired) {
          await updateDoc('offers', offer.id, { status: 'expired' });
        }
        if (expired.length > 0) logger.info(`Expired ${expired.length} offers`);
      } catch (err) { logger.error('Offer expiry error: ' + err.message); }
    });

    logger.info('Link API fully ready ✓');
  } catch (err) {
    logger.error('Boot error: ' + err.message);
    // Don't crash — /health still works, investigate via logs
  }
}
