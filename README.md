# Link — Local Services Marketplace

> Find your service, agree on a deal, and book — all in one place.

## Architecture

```
link/
├── backend/        Node.js + Express API
├── frontend/       React Native (Expo) mobile app
└── admin/          React web admin panel
```

## Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo |
| Backend | Node.js + Express |
| Database | PostgreSQL (Supabase) |
| Cache | Redis |
| Payments | Paystack |
| Storage | AWS S3 |
| VoIP | Africa's Talking |
| Push | Expo Notifications |
| Hosting | Railway (backend) |

---

## Setup Guide

### Step 1 — Database (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the entire contents of `backend/src/config/schema.sql`
3. Copy your database connection string (Settings → Database → Connection string → URI)

### Step 2 — Paystack ⚠️ REQUIRED

1. Create account at [paystack.com](https://paystack.com)
2. Go to Settings → Developer → API Keys
3. Copy your **Secret Key** and **Public Key**
4. Set up webhook URL: `https://your-api-url.railway.app/api/payments/webhook`
5. Copy the webhook secret

### Step 3 — AWS S3 ⚠️ REQUIRED

1. Create account at [aws.amazon.com](https://aws.amazon.com)
2. Create an S3 bucket named `link-marketplace-media`
3. Set bucket region to `af-south-1` (Cape Town — closest to Nigeria)
4. Create an IAM user with S3 full access
5. Copy Access Key ID and Secret Access Key

### Step 4 — Africa's Talking (VoIP)

1. Create account at [africastalking.com](https://africastalking.com)
2. Create an application
3. Copy API Key and Username

### Step 5 — Backend Environment

```bash
cd backend
cp .env.example .env
# Fill in all values in .env
npm install
npm run dev
```

### Step 6 — Frontend Setup

```bash
cd frontend
npm install
# Create .env file:
echo "EXPO_PUBLIC_API_URL=http://localhost:5000/api" > .env
npx expo start
```

### Step 7 — Admin Panel

```bash
cd admin
npm install
# Create .env file:
echo "VITE_API_URL=http://localhost:5000/api" > .env
npm run dev
```

---

## Deployment

### Backend → Railway

1. Push backend to GitHub
2. Connect repo to [railway.app](https://railway.app)
3. Add all environment variables from `.env`
4. Railway auto-deploys on push

### Frontend → Expo EAS

```bash
cd frontend
npm install -g eas-cli
eas login
eas build --platform all
eas submit
```

### Admin → Vercel

```bash
cd admin
npm install -g vercel
vercel --prod
```

---

## API Endpoints

```
POST   /api/auth/otp/send
POST   /api/auth/otp/verify
POST   /api/auth/signup/customer
POST   /api/auth/signup/vendor
POST   /api/auth/login

POST   /api/kyc/identity
POST   /api/kyc/id-document
POST   /api/kyc/selfie
POST   /api/kyc/services
POST   /api/kyc/portfolio
POST   /api/kyc/location
POST   /api/kyc/submit
GET    /api/kyc/status

GET    /api/search/autocomplete
GET    /api/search/vendors
GET    /api/search/vendor/:id
GET    /api/search/services

POST   /api/offers
POST   /api/offers/:id/respond
POST   /api/offers/:id/accept
GET    /api/offers/mine
GET    /api/offers/job/:jobId

POST   /api/payments/initiate
POST   /api/payments/webhook
GET    /api/payments/verify/:ref
GET    /api/payments/banks

GET    /api/jobs
GET    /api/jobs/:id
POST   /api/jobs/:id/complete
POST   /api/jobs/:id/confirm
POST   /api/jobs/review

GET    /api/wallet
POST   /api/wallet/withdraw
GET    /api/wallet/transactions

POST   /api/disputes
POST   /api/disputes/:id/evidence
GET    /api/disputes/:id

GET    /api/notifications
POST   /api/notifications/read

GET    /api/admin/dashboard
GET    /api/admin/kyc
POST   /api/admin/kyc/:id/review
GET    /api/admin/disputes
POST   /api/admin/disputes/:id/rule
GET    /api/admin/vendors
POST   /api/admin/vendors/:id/status
GET    /api/admin/metrics
GET    /api/admin/services/pending
POST   /api/admin/services/:id
```

---

## Platform Fee

Link charges **10%** on every completed transaction, deducted automatically before vendor payout.

| Job Value | Platform Fee | Vendor Receives |
|-----------|-------------|-----------------|
| ₦5,000 | ₦500 | ₦4,500 |
| ₦10,000 | ₦1,000 | ₦9,000 |
| ₦25,000 | ₦2,500 | ₦22,500 |
| ₦50,000 | ₦5,000 | ₦45,000 |

---

## Key Rules

- All vendor communication is in-app only — no phone number exchange
- All calls and voice notes are recorded as contract evidence
- Payments held in escrow until job completion confirmed
- 24-hour window after vendor marks complete — auto-releases if no response
- KYC required before any vendor can be discovered
- Maximum 4 service tags per vendor
- Maximum 4 portfolio images per vendor
- Minimum withdrawal: ₦2,000

---

*Link — Built for the Nigerian local services market.*
