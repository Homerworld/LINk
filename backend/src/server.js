require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Track boot status so we can report it
const bootStatus = { firebase: false, seeded: false, error: null };

// ── Health check — always responds, even if Firebase is down ──────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    firebase: bootStatus.firebase,
    seeded: bootStatus.seeded,
    bootError: bootStatus.error,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ── Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(morgan('tiny', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Mount API routes IMMEDIATELY (not dependent on Firebase boot) ──
// If a request comes in before Firebase is ready, the controller's own
// try/catch returns a clean error instead of "Cannot POST".
const { authRouter, searchRouter, offerRouter, paymentRouter, jobRouter, walletRouter, kycRouter, adminRouter } = require('./routes/index');
app.use('/api/auth', authRouter);
app.use('/api/search', searchRouter);
app.use('/api/offers', offerRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/jobs', jobRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/kyc', kycRouter);
app.use('/api/admin', adminRouter);

// 404 + error handlers
app.use((req, res) => res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  logger.error('Error: ' + err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start listening immediately so Railway sees a healthy app ─────
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Link API listening on port ${PORT}`);
  bootFirebase();
});

// ── Connect Firebase + seed, with retry. Routes already live. ─────
async function bootFirebase(attempt = 1) {
  try {
    const { initFirebase } = require('./config/firebase');
    initFirebase();
    bootStatus.firebase = true;
    logger.info('Firebase connected');

    const setup = require('./config/setup');
    await setup();
    bootStatus.seeded = true;
    bootStatus.error = null;

    startCronJobs();
    logger.info('Link API fully ready');
  } catch (err) {
    bootStatus.error = err.message;
    logger.error(`Boot error (attempt ${attempt}): ${err.message}`);
    if (attempt < 5) {
      const delay = attempt * 3000;
      logger.warn(`Retrying Firebase connection in ${delay / 1000}s...`);
      setTimeout(() => bootFirebase(attempt + 1), delay);
    } else {
      logger.error('Firebase failed after 5 attempts. Check FIREBASE_* env vars. Server stays up on /health.');
    }
  }
}

function startCronJobs() {
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
      for (const offer of expired) await updateDoc('offers', offer.id, { status: 'expired' });
      if (expired.length > 0) logger.info(`Expired ${expired.length} offers`);
    } catch (err) { logger.error('Offer expiry error: ' + err.message); }
  });

  logger.info('Cron jobs scheduled');
}
