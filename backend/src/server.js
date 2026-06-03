require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Health check FIRST — always responds even if DB is down ───────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Boot — start server first, then connect DB ────────────────────
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Link API listening on port ${PORT}`);
  initDatabase();
});

async function initDatabase() {
  try {
    const setup = require('./config/setup');
    const cronJobs = require('./jobs/cronJobs');
    const authRoutes = require('./routes/auth');
    const { searchRouter, offerRouter, paymentRouter, jobRouter, walletRouter, kycRouter, adminRouter } = require('./routes/index');

    await setup();

    // Mount routes after DB is ready
    app.use('/api/auth', authRoutes);
    app.use('/api/search', searchRouter);
    app.use('/api/offers', offerRouter);
    app.use('/api/payments', paymentRouter);
    app.use('/api/jobs', jobRouter);
    app.use('/api/wallet', walletRouter);
    app.use('/api/kyc', kycRouter);
    app.use('/api/admin', adminRouter);

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.path}` });
    });

    // Error handler
    app.use((err, req, res, next) => {
      logger.error('Unhandled error: ' + err.message);
      res.status(500).json({ success: false, message: 'Internal server error' });
    });

    cronJobs.init();
    logger.info('Link API fully ready');
  } catch (err) {
    logger.error('Database init failed: ' + err.message);
    logger.warn('Server is running but database is unavailable. Check DATABASE_URL.');
    // Don't exit — keep serving /health so Railway knows we're alive
  }
}
