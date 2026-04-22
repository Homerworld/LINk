const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
  });

  // PostgreSQL errors
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Resource already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced resource not found' });
  }

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  return res.status(statusCode).json({ success: false, message });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
};

module.exports = { errorHandler, notFoundHandler };
