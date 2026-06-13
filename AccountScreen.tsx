# Link — Hardening Update & Go-Live Guide

This update fixes the blockers and high-priority bugs from the QA/DevOps review.
Everything works in **dev/test mode right now**. The only things left for real money
are the "test → real" switches in the last section.

---

## What was fixed in this update

### Money paths are now atomic (no more lost/created money)
- **`confirmJob`**, **`releaseFunds`** (auto-release cron), **`activateJob`** (escrow funding), and **`withdraw`** now run inside Firestore **transactions** using atomic `increment()`. Two events hitting the same wallet at once can no longer overwrite each other.
- Each one **re-checks status inside the transaction**, so a manual confirm, the auto-release cron, and a dispute can't double-release the same job.

### Withdrawals are safe
- Atomic debit with an **overdraw guard** (can't withdraw more than the balance, even under a race).
- **Idempotency key** — a double-tap or retry won't debit twice.
- **Real payout scaffold**: when a live Paystack key is present, it creates a transfer recipient and initiates a Paystack Transfer, storing the reference. If the payout call fails *after* debiting, the withdrawal is marked `needs_review` instead of silently vanishing.
- In dev (placeholder key) withdrawals stay `pending` for manual handling — same as before, nothing breaks.

### Payment confirmation no longer depends only on the webhook
- New endpoint **`GET /api/payments/verify/:reference`** checks the payment server-side with Paystack. The app calls it after the customer returns from the browser, so a delayed/dropped webhook no longer strands a paid job.
- The mobile app now **opens the Paystack checkout in the browser** and offers an "I have paid" button that verifies.

### Real bugs fixed
- **`orderBy` string bug**: `queryDocs(..., 'createdAt')` was ordering by field "c". Now handled correctly (and these lists sort in memory to avoid composite-index requirements).
- **Timestamp vs Date**: Firestore Timestamps are now normalized to ISO strings on every read, so the app and the sort logic work and lists are actually newest-first.

### Input validation
- Offer and counter amounts are validated server-side: integer, min ₦100, max ₦1,000,000. The server no longer trusts client amounts blindly.

### Security / ops files added
- **`firestore.rules`** — locks the database. All app access goes through the backend (Admin SDK, which bypasses rules), so clients are denied direct access. This replaces the open "test mode."
- **`firestore.indexes.json`** — the composite indexes the vendor-search and KYC-queue queries need.
- **`.gitignore`** — keeps `.env` and any service-account JSON out of git.

---

## Deploy the updated backend

1. Replace your backend files with this `backend/` folder (or just `src/`, plus the new `firestore.rules`, `firestore.indexes.json`, `.gitignore`).
2. Commit & push. Railway redeploys automatically. (Root Directory stays `backend`.)
3. Health check should still return `{"status":"ok","firebase":true,"seeded":true}`.

### Apply the Firestore security rules (important — closes the open database)
In the [Firebase Console](https://console.firebase.google.com) → your project `link-marketplace-581ce`:
1. **Firestore Database → Rules** tab → paste the contents of `firestore.rules` → **Publish**.
2. **Firestore Database → Indexes** tab → add the two composite indexes from `firestore.indexes.json` (or run `firebase deploy --only firestore:indexes` if you use the CLI).
3. Turn on backups: **Firestore → ⋯ → Scheduled backups** (or set up a daily export).

After publishing rules, confirm the app still works — it will, because the backend uses the Admin SDK. If something returns empty, check the Railway logs for a Firestore "create index" link and add that index.

---

## ✅ What's LEFT — the only "test → real" switches

These are intentionally the last step. Until you flip them, everything runs safely in test mode.

1. **Live Paystack keys.** In Railway env, set `PAYSTACK_SECRET_KEY` to your **live** secret key (currently a placeholder). This automatically:
   - switches payments from dev-auto-confirm to real Paystack checkout,
   - enables real bank payouts on withdrawal.
   Also set your Paystack **webhook URL** to `https://<your-railway-url>/api/payments/webhook`.

2. **`NODE_ENV=production`** in Railway env. This:
   - turns off the dev OTP (`123456`) and the `dev-confirm` endpoint,
   - switches OTP to random codes.

3. **Real SMS for OTP.** The code currently logs the OTP instead of sending it (`authController.sendOtp` has the `TODO: Send via SMS`). Plug in an SMS provider (Termii, Africa's Talking, Twilio) there before launch, otherwise users can't receive codes in production.

4. **(Recommended) Shorten the access token.** `JWT_EXPIRES_IN` is 30d. For production, set it to something like `1d` and rely on the refresh token.

That's the whole list. Do 1–3 and you're live on real money; the structural hardening is already done.

---

## Still worth doing soon (not blockers)
- Error tracking (Sentry) + an alert when a withdrawal hits `needs_review` or a webhook fails.
- A reconciliation cron that calls `verify` on `pending_payment` jobs older than ~15 min.
- Pagination on the admin vendor/list endpoints as you grow.
- Notifications (push token is already captured, just unused).
- Admin audit log (who approved which KYC / ruled which dispute).
