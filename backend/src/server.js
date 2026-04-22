require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const redis = require('./config/redis');
const cronJobs = require('./jobs/cronJobs');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const kycRoutes = require('./routes/kyc');
const searchRoutes = require('./routes/search');
const {
  offersRouter, paymentsRouter, jobsRouter,
  walletRouter, disputesRouter, notifRouter, adminRouter
} = require('./routes/index');

const app = express();

// ── Security middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL, process.env.ADMIN_URL]
    : '*',
  credentials: true,
}));

// ── Paystack webhook needs raw body ───────────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── Body parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
}

// ── Global rate limit ─────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests' },
}));

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/offers', offersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/notifications', notifRouter);
app.use('/api/admin', adminRouter);

// ── Error handling ────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await redis.connect();
    logger.info('Redis connected');

    cronJobs.init();

    app.listen(PORT, () => {
      logger.info(`Link API running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
};

start();

module.exports = app;
