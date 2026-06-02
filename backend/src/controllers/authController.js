const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

const generateTokens = (user) => {
  const payload = { userId: user.id, role: user.role };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d' });
  return { accessToken, refreshToken };
};

const formatUser = (user) => ({
  id: user.id,
  role: user.role,
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  phone_verified: user.phone_verified,
});

// POST /api/auth/otp/send
exports.sendOtp = async (req, res) => {
  try {
    const { phone, purpose } = req.body;

    // In production, integrate Africa's Talking SMS here
    // For now, generate and store OTP (always "123456" in dev)
    const code = process.env.NODE_ENV === 'production'
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '123456';

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await query(
      `INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
      [phone, code, purpose || 'signup', expiresAt]
    );

    // TODO: Send via Africa's Talking SMS API
    // await smsService.send(phone, `Your Link verification code: ${code}`);

    logger.info(`OTP sent to ${phone}: ${code} (${process.env.NODE_ENV})`);

    return success(res, {
      phone,
      // Only expose code in development
      ...(process.env.NODE_ENV !== 'production' && { code }),
    }, 'OTP sent successfully');
  } catch (err) {
    logger.error('sendOtp error: ' + err.message);
    return error(res, 'Failed to send OTP');
  }
};

// POST /api/auth/otp/verify
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, code, purpose } = req.body;

    const result = await query(
      `SELECT id FROM otp_codes
       WHERE phone = $1 AND code = $2 AND purpose = $3
       AND expires_at > NOW() AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code, purpose || 'signup']
    );

    if (result.rows.length === 0) {
      return error(res, 'Invalid or expired OTP', 400);
    }

    await query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [result.rows[0].id]);

    return success(res, { verified: true }, 'OTP verified');
  } catch (err) {
    logger.error('verifyOtp error: ' + err.message);
    return error(res, 'Failed to verify OTP');
  }
};

// POST /api/auth/signup/customer
exports.customerSignup = async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    const existing = await query(`SELECT id FROM users WHERE phone = $1`, [phone]);
    if (existing.rows.length > 0) {
      return error(res, 'Phone number already registered', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (role, full_name, email, phone, phone_verified, password_hash)
       VALUES ('customer', $1, $2, $3, TRUE, $4)
       RETURNING id, role, full_name, email, phone, phone_verified`,
      [full_name, email || null, phone, passwordHash]
    );

    const user = result.rows[0];
    const tokens = generateTokens(user);

    return success(res, { user: formatUser(user), ...tokens }, 'Account created', 201);
  } catch (err) {
    logger.error('customerSignup error: ' + err.message);
    return error(res, 'Signup failed');
  }
};

// POST /api/auth/signup/vendor
exports.vendorSignup = async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    const existing = await query(`SELECT id FROM users WHERE phone = $1`, [phone]);
    if (existing.rows.length > 0) {
      return error(res, 'Phone number already registered', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const client = await require('../config/database').getClient();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (role, full_name, email, phone, phone_verified, password_hash)
         VALUES ('vendor', $1, $2, $3, TRUE, $4)
         RETURNING id, role, full_name, email, phone, phone_verified`,
        [full_name, email || null, phone, passwordHash]
      );
      const user = userResult.rows[0];

      // Create vendor profile + wallet
      await client.query(
        `INSERT INTO vendor_profiles (user_id) VALUES ($1)`, [user.id]
      );
      await client.query(
        `INSERT INTO wallets (vendor_id) VALUES ($1)`, [user.id]
      );

      await client.query('COMMIT');

      const tokens = generateTokens(user);
      return success(res, { user: formatUser(user), ...tokens }, 'Vendor account created', 201);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('vendorSignup error: ' + err.message);
    return error(res, 'Signup failed');
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const result = await query(
      `SELECT id, role, full_name, email, phone, phone_verified, password_hash, is_active
       FROM users WHERE phone = $1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return error(res, 'Invalid phone number or password', 401);
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return error(res, 'Your account has been suspended. Contact support.', 403);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return error(res, 'Invalid phone number or password', 401);
    }

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    const tokens = generateTokens(user);

    return success(res, { user: formatUser(user), ...tokens }, 'Login successful');
  } catch (err) {
    logger.error('login error: ' + err.message);
    return error(res, 'Login failed');
  }
};

// POST /api/auth/refresh
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return error(res, 'Refresh token required', 400);

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const result = await query(
      `SELECT id, role, full_name, email, phone, phone_verified, is_active FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return error(res, 'User not found or inactive', 401);
    }

    const tokens = generateTokens(result.rows[0]);
    return success(res, tokens, 'Token refreshed');
  } catch (err) {
    return error(res, 'Invalid refresh token', 401);
  }
};

// POST /api/auth/pin (set withdrawal PIN)
exports.setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const pinHash = await bcrypt.hash(pin, 12);
    await query(`UPDATE users SET withdrawal_pin_hash = $1 WHERE id = $2`, [pinHash, req.user.userId]);
    return success(res, {}, 'PIN set successfully');
  } catch (err) {
    return error(res, 'Failed to set PIN');
  }
};

// POST /api/auth/push-token
exports.updatePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    await query(`UPDATE users SET push_token = $1 WHERE id = $2`, [token, req.user.userId]);
    return success(res, {}, 'Push token updated');
  } catch (err) {
    return error(res, 'Failed to update push token');
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.role, u.full_name, u.email, u.phone, u.phone_verified,
              vp.kyc_status, vp.location_area, vp.avg_rating, vp.total_jobs
       FROM users u
       LEFT JOIN vendor_profiles vp ON vp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    if (result.rows.length === 0) return error(res, 'User not found', 404);
    return success(res, result.rows[0]);
  } catch (err) {
    return error(res, 'Failed to get user');
  }
};
