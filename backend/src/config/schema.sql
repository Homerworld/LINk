-- ================================================================
-- LINK MARKETPLACE — COMPLETE DATABASE SCHEMA
-- Run this against your Supabase PostgreSQL instance
-- ================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- GPS distance queries

-- ================================================================
-- ENUMS
-- ================================================================

CREATE TYPE user_role AS ENUM ('customer', 'vendor', 'admin');
CREATE TYPE kyc_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'info_requested');
CREATE TYPE id_type AS ENUM ('nin', 'voters_card', 'passport', 'drivers_licence');
CREATE TYPE vendor_status AS ENUM ('pending_kyc', 'active', 'suspended', 'banned');
CREATE TYPE service_location_type AS ENUM ('fixed', 'mobile', 'both');
CREATE TYPE offer_status AS ENUM ('pending', 'countered', 'accepted', 'declined', 'expired');
CREATE TYPE job_status AS ENUM ('negotiating', 'payment_pending', 'in_escrow', 'in_progress', 'completed_pending', 'completed', 'disputed', 'cancelled', 'refunded');
CREATE TYPE payment_method AS ENUM ('card', 'bank_transfer');
CREATE TYPE payment_status AS ENUM ('pending', 'successful', 'failed');
CREATE TYPE dispute_issue AS ENUM ('never_started', 'incomplete', 'quality', 'no_show');
CREATE TYPE dispute_status AS ENUM ('open', 'evidence_submitted', 'under_review', 'resolved');
CREATE TYPE dispute_ruling AS ENUM ('full_refund', 'full_payment', 'partial_split');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE notification_type AS ENUM (
  'kyc_submitted', 'kyc_approved', 'kyc_rejected', 'kyc_info_requested',
  'offer_received', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_expiring',
  'payment_successful', 'payment_failed', 'escrow_secured',
  'job_complete_pending', 'job_complete_reminder', 'job_auto_released',
  'dispute_raised', 'dispute_ruled',
  'withdrawal_initiated', 'withdrawal_complete',
  'new_review'
);

-- ================================================================
-- USERS
-- ================================================================

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role                user_role NOT NULL,
  full_name           VARCHAR(255) NOT NULL,
  email               VARCHAR(255) UNIQUE NOT NULL,
  phone               VARCHAR(20) UNIQUE NOT NULL,
  phone_verified      BOOLEAN DEFAULT FALSE,
  password_hash       VARCHAR(255) NOT NULL,
  profile_photo_url   TEXT,
  expo_push_token     TEXT,
  withdrawal_pin_hash VARCHAR(255),
  is_active           BOOLEAN DEFAULT TRUE,
  last_seen_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);

-- ================================================================
-- OTP VERIFICATION
-- ================================================================

CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(20) NOT NULL,
  code        VARCHAR(6) NOT NULL,
  purpose     VARCHAR(50) NOT NULL, -- 'signup', 'login', 'withdrawal'
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_otp_phone ON otp_codes(phone);

-- ================================================================
-- REFRESH TOKENS
-- ================================================================

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ================================================================
-- VENDOR PROFILES
-- ================================================================

CREATE TABLE vendor_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name         VARCHAR(255),
  bio                   TEXT,
  status                vendor_status DEFAULT 'pending_kyc',
  kyc_status            kyc_status DEFAULT 'pending',
  kyc_reviewed_by       UUID REFERENCES users(id),
  kyc_reviewed_at       TIMESTAMPTZ,
  kyc_rejection_reason  TEXT,
  verified_at           TIMESTAMPTZ,

  -- Location
  location_type         service_location_type DEFAULT 'fixed',
  location_area         VARCHAR(255),          -- General area, e.g. "Lekki, Lagos"
  location_lat          DECIMAL(10, 8),
  location_lng          DECIMAL(11, 8),
  service_radius_km     INTEGER DEFAULT 10,

  -- Availability
  availability_text     VARCHAR(255),          -- e.g. "Mon-Sat, 8am-6pm"
  available_days        INTEGER[] DEFAULT '{1,2,3,4,5,6}', -- 0=Sun,6=Sat
  available_from        TIME DEFAULT '08:00',
  available_to          TIME DEFAULT '18:00',
  is_available_now      BOOLEAN DEFAULT FALSE,

  -- Pricing
  price_min             INTEGER,               -- in kobo
  price_max             INTEGER,               -- in kobo
  price_negotiable      BOOLEAN DEFAULT TRUE,

  -- Stats (denormalized for performance)
  total_jobs            INTEGER DEFAULT 0,
  avg_rating            DECIMAL(3,2) DEFAULT 0.00,
  total_reviews         INTEGER DEFAULT 0,
  response_rate         DECIMAL(5,2) DEFAULT 0.00,
  completion_rate       DECIMAL(5,2) DEFAULT 0.00,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendor_profiles_user ON vendor_profiles(user_id);
CREATE INDEX idx_vendor_profiles_status ON vendor_profiles(status);
CREATE INDEX idx_vendor_profiles_kyc ON vendor_profiles(kyc_status);
CREATE INDEX idx_vendor_location ON vendor_profiles USING GIST (
  ST_SetSRID(ST_MakePoint(location_lng, location_lat), 4326)
) WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- ================================================================
-- KYC DOCUMENTS
-- ================================================================

CREATE TABLE kyc_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id       UUID REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  id_type         id_type,
  id_document_url TEXT,
  selfie_url      TEXT,
  bvn             VARCHAR(11),
  bvn_verified    BOOLEAN DEFAULT FALSE,
  id_verified     BOOLEAN DEFAULT FALSE,
  selfie_matched  BOOLEAN DEFAULT FALSE,
  bank_name       VARCHAR(255),
  bank_code       VARCHAR(10),
  account_number  VARCHAR(10),
  account_name    VARCHAR(255),
  account_verified BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_vendor ON kyc_documents(vendor_id);

-- ================================================================
-- SERVICES MASTER LIST
-- ================================================================

CREATE TABLE services (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) UNIQUE NOT NULL,
  slug          VARCHAR(255) UNIQUE NOT NULL,
  category      VARCHAR(100),
  is_approved   BOOLEAN DEFAULT FALSE,
  suggested_by  UUID REFERENCES users(id),
  approved_by   UUID REFERENCES users(id),
  usage_count   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_services_name ON services(name);
CREATE INDEX idx_services_slug ON services(slug);
CREATE INDEX idx_services_approved ON services(is_approved);

-- ================================================================
-- VENDOR SERVICES (many-to-many, max 4)
-- ================================================================

CREATE TABLE vendor_services (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id   UUID REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  service_id  UUID REFERENCES services(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, service_id)
);

CREATE INDEX idx_vendor_services_vendor ON vendor_services(vendor_id);
CREATE INDEX idx_vendor_services_service ON vendor_services(service_id);

-- ================================================================
-- PORTFOLIO IMAGES (max 4)
-- ================================================================

CREATE TABLE portfolio_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id   UUID REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  is_cover    BOOLEAN DEFAULT FALSE,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolio_vendor ON portfolio_images(vendor_id);

-- ================================================================
-- JOBS
-- ================================================================

CREATE TABLE jobs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference             VARCHAR(30) UNIQUE NOT NULL, -- LNK-YYYY-XXXXXX
  customer_id           UUID REFERENCES users(id),
  vendor_id             UUID REFERENCES users(id),
  service_id            UUID REFERENCES services(id),
  status                job_status DEFAULT 'negotiating',

  -- Agreed terms
  agreed_amount         INTEGER,                     -- in kobo
  platform_fee          INTEGER,                     -- in kobo (10%)
  vendor_payout         INTEGER,                     -- in kobo (90%)
  description           TEXT,

  -- Location for this job
  job_location          VARCHAR(255),

  -- Timing
  scheduled_at          TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  completion_deadline   TIMESTAMPTZ,                 -- 24hr window end
  auto_release_at       TIMESTAMPTZ,

  -- Payment
  payment_method        payment_method,
  payment_reference     VARCHAR(255),                -- Paystack ref
  virtual_account_id    VARCHAR(255),                -- Paystack virtual acct

  -- Communication
  call_enabled          BOOLEAN DEFAULT FALSE,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_reference ON jobs(reference);
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_vendor ON jobs(vendor_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_auto_release ON jobs(auto_release_at) WHERE status = 'completed_pending';

-- ================================================================
-- OFFERS (negotiation rounds)
-- ================================================================

CREATE TABLE offers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID REFERENCES jobs(id) ON DELETE CASCADE,
  offered_by    UUID REFERENCES users(id),
  amount        INTEGER NOT NULL,               -- in kobo
  reason        VARCHAR(255),
  round         INTEGER DEFAULT 1,              -- max 3
  status        offer_status DEFAULT 'pending',
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offers_job ON offers(job_id);
CREATE INDEX idx_offers_status ON offers(status);

-- ================================================================
-- ESCROW WALLET TRANSACTIONS
-- ================================================================

CREATE TABLE wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  job_id          UUID REFERENCES jobs(id),
  type            VARCHAR(50) NOT NULL,         -- 'escrow_in', 'escrow_out', 'fee', 'payout', 'refund'
  amount          INTEGER NOT NULL,             -- in kobo
  balance_after   INTEGER NOT NULL,             -- in kobo
  description     TEXT,
  reference       VARCHAR(255),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_user ON wallet_transactions(user_id);
CREATE INDEX idx_wallet_job ON wallet_transactions(job_id);

-- ================================================================
-- VENDOR WALLETS
-- ================================================================

CREATE TABLE vendor_wallets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available_balance INTEGER DEFAULT 0,          -- in kobo
  escrow_balance    INTEGER DEFAULT 0,          -- in kobo
  total_earned      INTEGER DEFAULT 0,          -- in kobo
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendor_wallets_vendor ON vendor_wallets(vendor_id);

-- ================================================================
-- WITHDRAWALS
-- ================================================================

CREATE TABLE withdrawals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id       UUID REFERENCES users(id),
  amount          INTEGER NOT NULL,             -- in kobo
  fee             INTEGER DEFAULT 0,            -- future instant payout fee
  net_amount      INTEGER NOT NULL,             -- in kobo
  bank_name       VARCHAR(255),
  account_number  VARCHAR(10),
  account_name    VARCHAR(255),
  status          withdrawal_status DEFAULT 'pending',
  paystack_ref    VARCHAR(255),
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_withdrawals_vendor ON withdrawals(vendor_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);

-- ================================================================
-- PAYMENT RECORDS
-- ================================================================

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID REFERENCES jobs(id),
  customer_id     UUID REFERENCES users(id),
  amount          INTEGER NOT NULL,             -- in kobo
  method          payment_method,
  status          payment_status DEFAULT 'pending',
  paystack_ref    VARCHAR(255) UNIQUE,
  paystack_data   JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_job ON payments(job_id);
CREATE INDEX idx_payments_paystack_ref ON payments(paystack_ref);

-- ================================================================
-- IN-APP COMMUNICATIONS
-- ================================================================

CREATE TABLE job_calls (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  initiated_by    UUID REFERENCES users(id),
  duration_secs   INTEGER DEFAULT 0,
  recording_url   TEXT,
  recording_key   TEXT,                         -- S3 key
  at_session_id   VARCHAR(255),                 -- Africa's Talking session
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ                   -- recording deletion date
);

CREATE INDEX idx_calls_job ON job_calls(job_id);

CREATE TABLE voice_notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  sent_by         UUID REFERENCES users(id),
  duration_secs   INTEGER NOT NULL,
  recording_url   TEXT NOT NULL,
  recording_key   TEXT NOT NULL,                -- S3 key
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_voice_notes_job ON voice_notes(job_id);

-- ================================================================
-- DISPUTES
-- ================================================================

CREATE TABLE disputes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID UNIQUE REFERENCES jobs(id),
  raised_by       UUID REFERENCES users(id),
  issue           dispute_issue NOT NULL,
  status          dispute_status DEFAULT 'open',
  ruling          dispute_ruling,
  ruling_split    INTEGER,                      -- customer % if partial split
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  ruling_notes    TEXT,
  evidence_deadline TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_disputes_job ON disputes(job_id);
CREATE INDEX idx_disputes_status ON disputes(status);

CREATE TABLE dispute_evidence (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id    UUID REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by  UUID REFERENCES users(id),
  type          VARCHAR(20) NOT NULL,           -- 'photo', 'voice_note', 'video'
  file_url      TEXT NOT NULL,
  file_key      TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evidence_dispute ON dispute_evidence(dispute_id);

-- ================================================================
-- REVIEWS
-- ================================================================

CREATE TABLE reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID UNIQUE REFERENCES jobs(id),
  customer_id   UUID REFERENCES users(id),
  vendor_id     UUID REFERENCES users(id),
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_vendor ON reviews(vendor_id);
CREATE INDEX idx_reviews_customer ON reviews(customer_id);

-- ================================================================
-- NOTIFICATIONS
-- ================================================================

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  type          notification_type NOT NULL,
  title         VARCHAR(255) NOT NULL,
  body          TEXT NOT NULL,
  data          JSONB DEFAULT '{}',
  read          BOOLEAN DEFAULT FALSE,
  sent          BOOLEAN DEFAULT FALSE,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);

-- ================================================================
-- AUDIT LOG
-- ================================================================

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES users(id),
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(50),
  entity_id     UUID,
  metadata      JSONB DEFAULT '{}',
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- ================================================================
-- FUNCTIONS — auto-update updated_at
-- ================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vendor_profiles_updated BEFORE UPDATE ON vendor_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_kyc_updated BEFORE UPDATE ON kyc_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_offers_updated BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_disputes_updated BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_withdrawals_updated BEFORE UPDATE ON withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- SEED: initial approved services
-- ================================================================

INSERT INTO services (name, slug, category, is_approved) VALUES
  ('Hairdresser', 'hairdresser', 'Beauty', TRUE),
  ('Nail Technician', 'nail-technician', 'Beauty', TRUE),
  ('Barber', 'barber', 'Beauty', TRUE),
  ('Makeup Artist', 'makeup-artist', 'Beauty', TRUE),
  ('Tailor', 'tailor', 'Fashion', TRUE),
  ('Fashion Designer', 'fashion-designer', 'Fashion', TRUE),
  ('Mechanic', 'mechanic', 'Automotive', TRUE),
  ('Car Washer', 'car-washer', 'Automotive', TRUE),
  ('Electrician', 'electrician', 'Home Services', TRUE),
  ('Plumber', 'plumber', 'Home Services', TRUE),
  ('Painter', 'painter', 'Home Services', TRUE),
  ('Carpenter', 'carpenter', 'Home Services', TRUE),
  ('Cleaner', 'cleaner', 'Home Services', TRUE),
  ('Generator Repair', 'generator-repair', 'Home Services', TRUE),
  ('AC Repair', 'ac-repair', 'Home Services', TRUE),
  ('Waiter', 'waiter', 'Events', TRUE),
  ('Event Decorator', 'event-decorator', 'Events', TRUE),
  ('Photographer', 'photographer', 'Creative', TRUE),
  ('Videographer', 'videographer', 'Creative', TRUE),
  ('Tutor', 'tutor', 'Education', TRUE),
  ('Personal Trainer', 'personal-trainer', 'Fitness', TRUE),
  ('Massage Therapist', 'massage-therapist', 'Wellness', TRUE),
  ('Dispatch Rider', 'dispatch-rider', 'Logistics', TRUE),
  ('Laundry', 'laundry', 'Home Services', TRUE),
  ('Watch Repair', 'watch-repair', 'Repairs', TRUE),
  ('Phone Repair', 'phone-repair', 'Repairs', TRUE),
  ('Welder', 'welder', 'Construction', TRUE),
  ('Tiler', 'tiler', 'Construction', TRUE),
  ('Security Guard', 'security-guard', 'Security', TRUE),
  ('Wardrobe Organiser', 'wardrobe-organiser', 'Home Services', TRUE);
