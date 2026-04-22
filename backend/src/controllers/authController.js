const bcrypt = require('bcryptjs');
const { query, getClient } = require('../config/database');
const redis = require('../config/redis');
const { generateTokens } = require('../middleware/auth');
const { success, created, error, unauthorized, validationError } = require('../utils/response');
const { generateOTP, addHours } = require('../utils/helpers');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

// ── Send OTP ──────────────────────────────────────────────────────
exports.sendOtp = async (req, res) => {
  try {
    const { phone, purpose } = req.body;

    // Rate limit: max 3 OTPs per phone per hour
    const rateLimitKey = `otp_rate:${phone}`;
    const attempts = await redis.get(rateLimitKey) || 0;
    if (parseInt(attempts) >= 3) {
      return error(res, 'Too many OTP requests. Please wait before trying again.', 429);
    }

    const code = generateOTP();
    const expiresAt = addHours(new Date(), 0.25); // 15 minutes

    // Store OTP
    await query(
      `INSERT INTO otp_codes (phone, code, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [phone, code, purpose, expiresAt]
    );

    // Increment rate limit
    await redis.set(rateLimitKey, parseInt(attempts) + 1, 3600);

    // TODO Wale: Integrate Africa's Talking SMS here to send OTP
    // For now we log it — in production this sends an SMS
    logger.info(`OTP for ${phone}: ${code}`);

    // In production send via AT SMS:
    // await smsService.send(phone, `Your Link verification code is ${code}. Valid for 15 minutes.`);

    return success(res, { expires_in: 900 }, 'OTP sent successfully');
  } catch (err) {
    logger.error('Send OTP error', err);
    return error(res, 'Failed to send OTP');
  }
};

// ── Verify OTP ────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, code, purpose } = req.body;

    const result = await query(
      `SELECT id FROM otp_codes
       WHERE phone = $1 AND code = $2 AND purpose = $3
       AND expires_at > NOW() AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code, purpose]
    );

    if (!result.rows[0]) {
      return error(res, 'Invalid or expired OTP', 400);
    }

    // Mark OTP as used
    await query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [result.rows[0].id]);

    // Store verified status in Redis (valid for 10 mins to complete signup)
    await redis.set(`phone_verified:${phone}:${purpose}`, true, 600);

    return success(res, { verified: true }, 'Phone verified successfully');
  } catch (err) {
    logger.error('Verify OTP error', err);
    return error(res, 'OTP verification failed');
  }
};

// ── Customer Signup ───────────────────────────────────────────────
exports.customerSignup = async (req, res) => {
  const client = await getClient();
  try {
    const { full_name, email, phone, password } = req.body;

    // Check phone was verified
    const phoneVerified = await redis.get(`phone_verified:${phone}:signup`);
    if (!phoneVerified) {
      return error(res, 'Phone number must be verified before signup', 400);
    }

    // Check email/phone uniqueness
    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );
    if (existing.rows[0]) {
      return error(res, 'An account with this email or phone already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (role, full_name, email, phone, phone_verified, password_hash)
       VALUES ('customer', $1, $2, $3, TRUE, $4)
       RETURNING id, role, full_name, email, phone`,
      [full_name, email, phone, passwordHash]
    );

    const user = userResult.rows[0];
    await client.query('COMMIT');

    // Clear verified flag
    await redis.del(`phone_verified:${phone}:signup`);

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Send welcome notification
    await notificationService.sendToUser(user.id, {
      type: 'kyc_submitted',
      title: 'Welcome to Link!',
      body: `Hi ${full_name.split(' ')[0]}, your account is ready. Start finding services near you.`,
    });

    return created(res, { user, accessToken, refreshToken }, 'Account created successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Customer signup error', err);
    return error(res, 'Signup failed');
  } finally {
    client.release();
  }
};

// ── Vendor Signup ─────────────────────────────────────────────────
exports.vendorSignup = async (req, res) => {
  const client = await getClient();
  try {
    const { full_name, email, phone, password, business_name } = req.body;

    const phoneVerified = await redis.get(`phone_verified:${phone}:signup`);
    if (!phoneVerified) {
      return error(res, 'Phone number must be verified before signup', 400);
    }

    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );
    if (existing.rows[0]) {
      return error(res, 'An account with this email or phone already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (role, full_name, email, phone, phone_verified, password_hash)
       VALUES ('vendor', $1, $2, $3, TRUE, $4)
       RETURNING id, role, full_name, email, phone`,
      [full_name, email, phone, passwordHash]
    );

    const user = userResult.rows[0];

    // Create vendor profile
    await client.query(
      `INSERT INTO vendor_profiles (user_id, business_name)
       VALUES ($1, $2)`,
      [user.id, business_name || full_name]
    );

    // Create vendor wallet
    await client.query(
      'INSERT INTO vendor_wallets (vendor_id) VALUES ($1)',
      [user.id]
    );

    await client.query('COMMIT');

    await redis.del(`phone_verified:${phone}:signup`);

    const { accessToken, refreshToken } = generateTokens(user.id);

    return created(res, { user, accessToken, refreshToken }, 'Vendor account created. Please complete KYC to go live.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Vendor signup error', err);
    return error(res, 'Signup failed');
  } finally {
    client.release();
  }
};

// ── Login ─────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const result = await query(
      `SELECT id, role, full_name, email, phone, password_hash, is_active
       FROM users WHERE phone = $1`,
      [phone]
    );

    const user = result.rows[0];
    if (!user) return unauthorized(res, 'Invalid phone number or password');

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return unauthorized(res, 'Invalid phone number or password');

    if (!user.is_active) return error(res, 'Your account has been suspended. Contact support.', 403);

    // Update last seen
    await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]);

    const { accessToken, refreshToken } = generateTokens(user.id);

    const { password_hash, ...safeUser } = user;

    return success(res, { user: safeUser, accessToken, refreshToken }, 'Login successful');
  } catch (err) {
    logger.error('Login error', err);
    return error(res, 'Login failed');
  }
};

// ── Refresh Token ─────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return unauthorized(res, 'Refresh token required');

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const userResult = await query(
      'SELECT id, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!userResult.rows[0] || !userResult.rows[0].is_active) {
      return unauthorized(res, 'Invalid refresh token');
    }

    const tokens = generateTokens(decoded.userId);
    return success(res, tokens, 'Token refreshed');
  } catch (err) {
    return unauthorized(res, 'Invalid or expired refresh token');
  }
};

// ── Set Withdrawal PIN ────────────────────────────────────────────
exports.setWithdrawalPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const pinHash = await bcrypt.hash(pin, 10);
    await query('UPDATE users SET withdrawal_pin_hash = $1 WHERE id = $2', [pinHash, req.user.id]);
    return success(res, {}, 'Withdrawal PIN set successfully');
  } catch (err) {
    logger.error('Set PIN error', err);
    return error(res, 'Failed to set PIN');
  }
};

// ── Update Expo Push Token ────────────────────────────────────────
exports.updatePushToken = async (req, res) => {
  try {
    const { expo_push_token } = req.body;
    await query('UPDATE users SET expo_push_token = $1 WHERE id = $2', [expo_push_token, req.user.id]);
    return success(res, {}, 'Push token updated');
  } catch (err) {
    return error(res, 'Failed to update push token');
  }
};
