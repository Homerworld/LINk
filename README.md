# Link — Full Project (Hardened Build)

Three parts:
- `backend/`  — Node/Express API on Firebase, deploys to Railway
- `frontend/` — Expo mobile app (runs on your phone via Expo Go)
- `admin/`    — Vite/React admin panel (runs in your browser)

## Start here
1. **CHANGELOG_AND_GOLIVE.md** — what changed in this hardening update, how to deploy it, and the exact "test → real" switches you have left.
2. **Link_QA_DevOps_Review.md** — the full QA/DevOps review this update is based on.

## Quick run (dev/test mode — works as-is)
- Backend: push `backend/` to your Railway repo (Root Directory = `backend`). Then publish `backend/firestore.rules` in the Firebase console.
- Mobile: `cd frontend` → `npm install` → `npx expo start -c` → scan QR.
- Admin: `cd admin` → `npm install` → `npm run dev` → open localhost:5173 (login 08140439590 / your admin password).

Everything runs safely in test mode. See CHANGELOG_AND_GOLIVE.md §"What's LEFT" to go live on real money.
