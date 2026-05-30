require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const setup = require('./config/setup');
const cronJobs = require('./jobs/cronJobs');
const authRoutes = require('./routes/auth');
const { searchRouter, offerRouter, paymentRouter, jobRouter, walletRouter, kycRouter, adminRouter } = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Health check — first, before everything ───────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Security & logging ────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Rate limiting ─────────────────────────────────────────────────
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// ── Paystack webhook needs raw body ──────────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── Body parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRouter);
app.use('/api/offers', offerRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/jobs', jobRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/kyc', kycRouter);
app.use('/api/admin', adminRouter);

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error: ' + err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────
const start = async () => {
  try {
    logger.info('Starting Link API...');
    await setup();          // creates tables + seeds admin
    cronJobs.init();
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Link API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start: ' + err.message);
    process.exit(1);
  }
};

start();
