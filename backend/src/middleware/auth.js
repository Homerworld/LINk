const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { unauthorized } = require('../utils/response');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      'SELECT id, role, full_name, email, phone, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows[0]) return unauthorized(res, 'User not found');
    if (!result.rows[0].is_active) return unauthorized(res, 'Account suspended');

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError') return unauthorized(res, 'Invalid token');
    return unauthorized(res, 'Authentication failed');
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }
  next();
};

const requireCustomer = requireRole('customer');
const requireVendor = requireRole('vendor');
const requireAdmin = requireRole('admin');

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d' }
  );
  return { accessToken, refreshToken };
};

module.exports = { authenticate, requireRole, requireCustomer, requireVendor, requireAdmin, generateTokens };
