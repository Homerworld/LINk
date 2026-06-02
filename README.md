# Link — Local Services Marketplace

> Find your service, agree on a deal, book and pay — all in one place.

## Project Structure

```
link/
├── backend/      Node.js + Express API (deploy to Railway)
├── admin/        React web admin panel (deploy to Vercel)
└── frontend/     React Native mobile app (publish via Expo)
```

## Quick Start

### 1. Deploy Backend to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set **Root Directory** to `/backend`
4. Add environment variables (see `backend/.env.example`)
5. Railway auto-deploys — admin user is created automatically on first boot

### 2. Deploy Admin Panel to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import repo
2. Set **Root Directory** to `admin`
3. Add `VITE_API_URL=https://your-railway-url.up.railway.app/api`
4. Deploy

### 3. Run Mobile App

```bash
cd frontend
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your Railway URL
npx expo start
```

## Environment Variables

### Backend (Railway)
| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_SECRET` | Long random string for JWT signing |
| `JWT_REFRESH_SECRET` | Another long random string |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PHONE` | Admin login phone |
| `ADMIN_PASSWORD` | Admin login password |
| `PAYSTACK_SECRET_KEY` | From dashboard.paystack.com |
| `PLATFORM_FEE_PERCENT` | Default: 10 |

### Admin Panel (Vercel)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Your Railway backend URL + /api |

### Mobile App (Expo)
| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Your Railway backend URL + /api |

## Key Product Rules

- 10% platform fee on every job
- Maximum 4 service tags per vendor
- 24-hour window after job completion before auto-release
- All calls recorded as contract evidence
- KYC required before vendor goes live
- Minimum withdrawal: ₦2,000

---
Built for the Nigerian local services market.
