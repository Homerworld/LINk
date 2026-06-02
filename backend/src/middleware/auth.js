const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return error(res, 'Authentication required', 401);
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return error(res, 'Invalid or expired token', 401);
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return error(res, 'Authentication required', 401);
  if (!roles.includes(req.user.role)) {
    return error(res, 'Access denied', 403);
  }
  next();
};

module.exports = { authenticate, requireRole };
