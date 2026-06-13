const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { queryDocs, addDoc, updateDoc, collection } = require('../config/firebase');
const { signTokens } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

// POST /api/auth/otp/send
exports.sendOtp = async (req, res) => {
  try {
    const { phone, purpose = 'signup' } = req.body;
    if (!phone) return fail(res, 'Phone number required', 400);

    const code = process.env.NODE_ENV === 'production'
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '123456';

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await addDoc('otpCodes', { phone, code, purpose, expiresAt, used: false });

    // TODO: Send via SMS in production
    logger.info(`OTP for ${phone}: ${code}`);

    return ok(res, {
      phone,
      ...(process.env.NODE_ENV !== 'production' && { code }),
    }, 'OTP sent');
  } catch (err) {
    logger.error('sendOtp: ' + err.message);
    return fail(res, 'Failed to send OTP');
  }
};

// POST /api/auth/otp/verify
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, code, purpose = 'signup' } = req.body;
    if (!phone || !code) return fail(res, 'Phone and code required', 400);

    const otps = await queryDocs('otpCodes', [
      ['phone', '==', phone],
      ['code', '==', code],
      ['purpose', '==', purpose],
      ['used', '==', false],
    ]);

    const valid = otps.find(o => new Date(o.expiresAt) > new Date());
    if (!valid) return fail(res, 'Invalid or expired OTP', 400);

    await updateDoc('otpCodes', valid.id, { used: true });
    return ok(res, { verified: true }, 'OTP verified');
  } catch (err) {
    logger.error('verifyOtp: ' + err.message);
    return fail(res, 'Verification failed');
  }
};

// POST /api/auth/signup/customer
exports.customerSignup = async (req, res) => {
  try {
    const { fullName, phone, password, email } = req.body;
    if (!fullName || !phone || !password) return fail(res, 'Full name, phone and password required', 400);

    const existing = await queryDocs('users', [['phone', '==', phone]], null, 1);
    if (existing.length > 0) return fail(res, 'Phone number already registered', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await addDoc('users', {
      role: 'customer',
      fullName,
      phone,
      email: email || null,
      phoneVerified: true,
      passwordHash,
      isActive: true,
    });

    const safeUser = { id: user.id, role: user.role, fullName: user.fullName, phone: user.phone };
    const tokens = signTokens({ id: user.id, role: 'customer', phone });

    return ok(res, { user: safeUser, ...tokens }, 'Account created', 201);
  } catch (err) {
    logger.error('customerSignup: ' + err.message);
    return fail(res, 'Signup failed');
  }
};

// POST /api/auth/signup/vendor
exports.vendorSignup = async (req, res) => {
  try {
    const { fullName, phone, password, email } = req.body;
    if (!fullName || !phone || !password) return fail(res, 'Full name, phone and password required', 400);

    const existing = await queryDocs('users', [['phone', '==', phone]], null, 1);
    if (existing.length > 0) return fail(res, 'Phone number already registered', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await addDoc('users', {
      role: 'vendor',
      fullName,
      phone,
      email: email || null,
      phoneVerified: true,
      passwordHash,
      isActive: true,
      kycStatus: 'pending',
      avgRating: 0,
      totalJobs: 0,
      totalReviews: 0,
      availableBalance: 0,
      escrowBalance: 0,
      totalEarned: 0,
    });

    const safeUser = { id: user.id, role: 'vendor', fullName: user.fullName, phone: user.phone, kycStatus: 'pending' };
    const tokens = signTokens({ id: user.id, role: 'vendor', phone });

    return ok(res, { user: safeUser, ...tokens }, 'Vendor account created', 201);
  } catch (err) {
    logger.error('vendorSignup: ' + err.message);
    return fail(res, 'Signup failed');
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return fail(res, 'Phone and password required', 400);

    const users = await queryDocs('users', [['phone', '==', phone]], null, 1);
    if (users.length === 0) return fail(res, 'Invalid phone number or password', 401);

    const user = users[0];
    if (!user.isActive) return fail(res, 'Account suspended', 403);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return fail(res, 'Invalid phone number or password', 401);

    await updateDoc('users', user.id, { lastLoginAt: new Date().toISOString() });

    const safeUser = {
      id: user.id, role: user.role, fullName: user.fullName,
      phone: user.phone, email: user.email,
      kycStatus: user.kycStatus || null,
    };
    const tokens = signTokens({ id: user.id, role: user.role, phone: user.phone });

    return ok(res, { user: safeUser, ...tokens }, 'Login successful');
  } catch (err) {
    logger.error('login: ' + err.message);
    return fail(res, 'Login failed');
  }
};

// POST /api/auth/refresh
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return fail(res, 'Refresh token required', 400);
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const users = await queryDocs('users', [['__name__', '==', decoded.userId]], null, 1);
    // Use getDoc instead
    const { getDoc } = require('../config/firebase');
    const user = await getDoc('users', decoded.userId);
    if (!user || !user.isActive) return fail(res, 'User not found', 401);
    const tokens = signTokens({ id: user.id, role: user.role, phone: user.phone });
    return ok(res, tokens, 'Token refreshed');
  } catch {
    return fail(res, 'Invalid refresh token', 401);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const { getDoc } = require('../config/firebase');
    const user = await getDoc('users', req.user.userId);
    if (!user) return fail(res, 'User not found', 404);
    const { passwordHash, ...safe } = user;
    return ok(res, safe);
  } catch (err) {
    return fail(res, 'Failed to get user');
  }
};

// POST /api/auth/pin
exports.setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length !== 4) return fail(res, '4-digit PIN required', 400);
    const pinHash = await bcrypt.hash(pin, 10);
    await updateDoc('users', req.user.userId, { withdrawalPinHash: pinHash });
    return ok(res, {}, 'PIN set');
  } catch (err) {
    return fail(res, 'Failed to set PIN');
  }
};

// POST /api/auth/push-token
exports.updatePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    await updateDoc('users', req.user.userId, { pushToken: token });
    return ok(res, {}, 'Push token updated');
  } catch {
    return fail(res, 'Failed to update push token');
  }
};
