const { pool } = require('./database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const createTables = async () => {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";

    CREATE TYPE user_role AS ENUM ('customer', 'vendor', 'admin');
    CREATE TYPE kyc_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'info_requested');
    CREATE TYPE job_status AS ENUM ('pending_payment', 'active', 'in_progress', 'completed', 'confirmed', 'disputed', 'cancelled', 'refunded');
    CREATE TYPE offer_status AS ENUM ('pending', 'countered', 'accepted', 'rejected', 'expired');
    CREATE TYPE dispute_issue AS ENUM ('never_started', 'incomplete', 'quality', 'no_show', 'other');
    CREATE TYPE dispute_status AS ENUM ('open', 'evidence_submitted', 'under_review', 'resolved');
    CREATE TYPE dispute_ruling AS ENUM ('full_refund', 'partial_split', 'full_payment');
    CREATE TYPE transaction_type AS ENUM ('escrow_in', 'escrow_out', 'payout', 'withdrawal', 'refund', 'fee');
    CREATE TYPE location_type AS ENUM ('fixed', 'mobile', 'both');
    CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  `).catch(() => {}); // ignore if types already exist

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      role user_role NOT NULL DEFAULT 'customer',
      full_name VARCHAR(200) NOT NULL,
      email VARCHAR(200) UNIQUE,
      phone VARCHAR(20) UNIQUE NOT NULL,
      phone_verified BOOLEAN DEFAULT FALSE,
      password_hash VARCHAR(200) NOT NULL,
      withdrawal_pin_hash VARCHAR(200),
      push_token TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vendor_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kyc_status kyc_status DEFAULT 'pending',
      kyc_submitted_at TIMESTAMPTZ,
      kyc_reviewed_at TIMESTAMPTZ,
      kyc_rejection_reason TEXT,
      id_type VARCHAR(50),
      id_document_url TEXT,
      selfie_url TEXT,
      bvn_verified BOOLEAN DEFAULT FALSE,
      bank_code VARCHAR(10),
      bank_name VARCHAR(100),
      account_number VARCHAR(20),
      account_name VARCHAR(200),
      location_area VARCHAR(200),
      location_type location_type DEFAULT 'fixed',
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      availability_text VARCHAR(500),
      available_days INTEGER[] DEFAULT '{1,2,3,4,5,6}',
      price_min INTEGER,
      price_max INTEGER,
      price_negotiable BOOLEAN DEFAULT TRUE,
      avg_rating DECIMAL(3,2) DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      response_rate DECIMAL(5,2) DEFAULT 0,
      is_online BOOLEAN DEFAULT FALSE,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS services (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) UNIQUE NOT NULL,
      category VARCHAR(100),
      is_active BOOLEAN DEFAULT TRUE,
      suggested_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vendor_services (
      vendor_profile_id UUID REFERENCES vendor_profiles(id) ON DELETE CASCADE,
      service_id UUID REFERENCES services(id) ON DELETE CASCADE,
      PRIMARY KEY (vendor_profile_id, service_id)
    );

    CREATE TABLE IF NOT EXISTS portfolio_images (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS offers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      customer_id UUID NOT NULL REFERENCES users(id),
      vendor_id UUID NOT NULL REFERENCES users(id),
      service_id UUID REFERENCES services(id),
      service_name VARCHAR(100),
      description TEXT,
      customer_amount INTEGER NOT NULL,
      vendor_amount INTEGER,
      final_amount INTEGER,
      round_number INTEGER DEFAULT 1,
      status offer_status DEFAULT 'pending',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      offer_id UUID UNIQUE NOT NULL REFERENCES offers(id),
      customer_id UUID NOT NULL REFERENCES users(id),
      vendor_id UUID NOT NULL REFERENCES users(id),
      service_name VARCHAR(100),
      agreed_amount INTEGER NOT NULL,
      platform_fee INTEGER NOT NULL,
      vendor_payout INTEGER NOT NULL,
      status job_status DEFAULT 'pending_payment',
      paystack_reference VARCHAR(200),
      payment_verified BOOLEAN DEFAULT FALSE,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      confirmed_at TIMESTAMPTZ,
      auto_release_at TIMESTAMPTZ,
      customer_review TEXT,
      customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
      vendor_review TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID UNIQUE NOT NULL REFERENCES jobs(id),
      raised_by UUID NOT NULL REFERENCES users(id),
      issue dispute_issue NOT NULL,
      description TEXT,
      status dispute_status DEFAULT 'open',
      ruling dispute_ruling,
      ruling_split INTEGER,
      ruling_notes TEXT,
      ruled_by UUID REFERENCES users(id),
      ruled_at TIMESTAMPTZ,
      deadline_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dispute_evidence (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
      submitted_by UUID NOT NULL REFERENCES users(id),
      type VARCHAR(50),
      file_url TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      available_balance INTEGER DEFAULT 0,
      escrow_balance INTEGER DEFAULT 0,
      total_earned INTEGER DEFAULT 0,
      total_withdrawn INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      job_id UUID REFERENCES jobs(id),
      type transaction_type NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL,
      bank_code VARCHAR(10),
      bank_name VARCHAR(100),
      account_number VARCHAR(20),
      account_name VARCHAR(200),
      paystack_transfer_code VARCHAR(200),
      status withdrawal_status DEFAULT 'pending',
      failure_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS call_recordings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      caller_id UUID NOT NULL REFERENCES users(id),
      callee_id UUID NOT NULL REFERENCES users(id),
      recording_url TEXT,
      duration_secs INTEGER DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS voice_notes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id),
      recording_url TEXT NOT NULL,
      duration_secs INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(50),
      data JSONB,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      purpose VARCHAR(50) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_vendor_profiles_kyc ON vendor_profiles(kyc_status);
    CREATE INDEX IF NOT EXISTS idx_vendor_profiles_location ON vendor_profiles(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_vendor ON jobs(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_offers_customer ON offers(customer_id);
    CREATE INDEX IF NOT EXISTS idx_offers_vendor ON offers(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, purpose);
  `);

  logger.info('Database tables ready');
};

const seedServices = async () => {
  const services = [
    ['Hair Braiding', 'Beauty'], ['Hair Weaving', 'Beauty'], ['Makeup Artist', 'Beauty'],
    ['Nail Technician', 'Beauty'], ['Barbing', 'Beauty'], ['Lash Extensions', 'Beauty'],
    ['Tailor', 'Fashion'], ['Shoe Cobbler', 'Fashion'], ['Dry Cleaning', 'Fashion'],
    ['Plumber', 'Home Services'], ['Electrician', 'Home Services'], ['Carpenter', 'Home Services'],
    ['AC Repair', 'Home Services'], ['Generator Repair', 'Home Services'], ['Painter', 'Home Services'],
    ['Cleaner', 'Home Services'], ['Fumigation', 'Home Services'], ['Tiler', 'Home Services'],
    ['Mechanic', 'Automotive'], ['Auto Electrician', 'Automotive'], ['Car Wash', 'Automotive'],
    ['Vulcanizer', 'Automotive'], ['Panel Beater', 'Automotive'],
    ['Private Tutor', 'Education'], ['Lesson Teacher', 'Education'],
    ['Photographer', 'Creative'], ['Videographer', 'Creative'], ['Event DJ', 'Creative'],
    ['Catering', 'Food'], ['Waiter/Waitress', 'Food'],
  ];

  for (const [name, category] of services) {
    await pool.query(
      `INSERT INTO services (name, category) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [name, category]
    );
  }
  logger.info('Services seeded');
};

const seedAdmin = async () => {
  const email = process.env.ADMIN_EMAIL;
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Link Admin';

  if (!email || !phone || !password) {
    logger.warn('Admin env vars not set (ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD) — skipping admin seed');
    return;
  }

  // Check if admin already exists
  const existing = await pool.query(
    `SELECT id FROM users WHERE role = 'admin' AND phone = $1`, [phone]
  );

  if (existing.rows.length > 0) {
    logger.info(`Admin already exists: ${phone}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (role, full_name, email, phone, phone_verified, password_hash, is_active)
     VALUES ('admin', $1, $2, $3, TRUE, $4, TRUE)
     ON CONFLICT (phone) DO UPDATE SET
       role = 'admin',
       password_hash = $4,
       is_active = TRUE,
       phone_verified = TRUE`,
    [name, email, phone, passwordHash]
  );

  logger.info(`Admin seeded: ${phone} / ${email}`);
};

const setup = async () => {
  try {
    logger.info('Setting up database...');
    await createTables();
    await seedServices();
    await seedAdmin();
    logger.info('Database setup complete');
  } catch (err) {
    logger.error('Database setup failed: ' + err.message);
    throw err;
  }
};

module.exports = setup;
