# Link — QA & DevOps Review
**Reviewer perspective:** Senior QA / DevOps Engineer
**Scope:** Full stack — Firebase backend (live on Railway), Expo mobile app, Vite admin panel
**Lens:** Real money, real users, Nigerian local-services marketplace

---

## 1. Verdict up front

Link is a **well-architected prototype that is genuinely close to working end-to-end**, but it is **not yet safe to put real money through**. The structure is right: escrow model, role separation, KYC gating, dispute resolution, auto-release cron, a clean health-check-first boot sequence. Someone thought about the product.

The gap is the difference between "works when one careful person clicks through it" and "survives 500 real users, two of whom are trying to cheat each other and one of whom has bad network." That gap is concentrated in three places: **money-handling correctness, data integrity under concurrency, and a few outright bugs** that will surface the moment real traffic hits.

I'd put it at **"working demo / pilot-with-fake-money ready," not "production / real-money ready."** The good news: almost everything below is fixable, and none of it requires re-architecting.

Severity scale used: 🔴 Blocker (real money/security risk) · 🟠 High (breaks for real users) · 🟡 Medium (degrades experience) · 🟢 Polish.

---

## 2. 🔴 Blockers — fix before a single real Naira moves

### 2.1 No atomic transactions on the money paths
Every balance change is a **read-then-write** with a gap in between:

```
releaseFunds(): read vendor → compute newEscrow/newAvailable → updateDoc
withdraw():     read user → check balance → updateDoc(balance - amount)
activateJob():  read vendor → updateDoc(escrow + payout)
```

Firestore gives you `runTransaction()` and atomic `increment()` precisely so two simultaneous operations don't clobber each other. As written, if a vendor's wallet is touched by two events at once (e.g. a withdrawal while the auto-release cron fires, or a customer confirms at the same moment), one update overwrites the other and **money is silently created or destroyed**. The `increment` helper is even imported in `paymentController` but never used.

**Why it matters with real users:** this is the classic double-spend / lost-credit bug. It won't show in single-user testing. It will show the first busy week, and you'll have vendors swearing their balance is wrong — and they'll be right.

**Fix:** wrap `releaseFunds`, `withdraw`, and `activateJob` in `db.runTransaction()`, or at minimum use `FieldValue.increment()` for every balance mutation instead of read-compute-write.

### 2.2 Withdrawal has no idempotency / debit-then-fail hole
`withdraw()` debits `availableBalance` and creates a `withdrawals` record with `status: 'pending'` — but there is **no actual payout integration** (no Paystack Transfer call) and no idempotency key. Two problems:
- If the request is retried (flaky network, user double-taps), there's nothing stopping a second debit.
- The money leaves the in-app balance but there is no system that actually sends it to the bank. Right now "withdrawal" = "decrement a number and write a TODO." A real user will withdraw, see their balance drop, and **never receive money**.

**Fix:** integrate Paystack Transfers (recipient creation + transfer) with the withdrawal in a transaction, store a transfer reference, and make the operation idempotent on a client-supplied key.

### 2.3 Production payment verification trusts only the webhook
In production, a job only activates via the Paystack webhook (`charge.success`). There is **no server-side `GET /transaction/verify/:reference`** fallback. If the webhook is delayed, dropped, or misconfigured (extremely common in practice), the customer pays, money leaves their account, and **the job never activates** — escrow is never funded, the vendor never sees it. There's also no reconciliation job to catch these.

**Fix:** add a verify-on-demand endpoint the app calls after redirect, plus a periodic reconciliation sweep for `pending_payment` jobs older than N minutes.

### 2.4 Admin credentials were committed to source / GitHub
The bundle README contained the admin phone and password in plain text, and it's now on GitHub. Even after you change it, **git history retains it**. Combined with `cors: '*'` and a 30-day access token, a leaked admin login is full control of KYC approvals, disputes, and vendor suspensions.

**Fix:** rotate the admin password now; make the repo private or delete+recreate without history; add `.gitignore` for `.env`; never ship credentials in docs.

---

## 3. 🟠 High — will break for real users

### 3.1 `queryDocs(..., 'createdAt')` is a real bug (offers, jobs, transactions)
`queryDocs`'s third argument is `orderBy` and is destructured as `orderBy[0]`, `orderBy[1]`. Calling it with the **string** `'createdAt'` makes Firestore order by field `'c'` direction `'r'` — invalid. Affected: `getMyOffers`, `getTransactions`. Depending on Firestore's parsing this either throws (empty list) or silently misorders. Users will see an **empty or scrambled Offers list / transaction history**.

**Fix:** pass `['createdAt', 'desc']`, and add the matching Firestore composite indexes.

### 3.2 Timestamp vs. Date mismatch in sorting
`addDoc` stores `createdAt` as a Firestore **server Timestamp object**, but `getMyOffers`/`getMyJobs` sort with `new Date(a.createdAt)`. `new Date({Timestamp})` is `Invalid Date`, so the sort is effectively random. Lists won't be newest-first as intended.

**Fix:** store ISO strings consistently, or convert Timestamps (`.toDate()`) before sorting/serializing. Right now Timestamps are also sent raw to the client, which can't parse them either.

### 3.3 Composite-index requirement will 500 in production
Queries like `getKycQueue` (`role == vendor` AND `kycStatus == status`) and the wallet/offers ordered queries require **Firestore composite indexes**. In test mode with a few docs they may work; at scale or with `orderBy` added, Firestore returns an error with a "create index" link that **your code swallows into a generic 'Failed'**. The admin KYC queue could simply stop returning vendors.

**Fix:** predefine indexes (`firestore.indexes.json`), and surface the real Firestore error in logs.

### 3.4 No payout actually reaches vendors (restates 2.2 from the vendor's view)
From the vendor's side this is the single most trust-destroying flow: earn → confirmed → withdraw → balance drops → nothing arrives. For a marketplace, the payout working is more important than almost anything else.

### 3.5 Search depends on `array-contains` + `kycStatus` + active filtering
`searchVendors` filters approved vendors by service. Confirm it also filters `isActive == true` (a suspended vendor shouldn't appear) and that the composite index exists. A suspended or unverified vendor showing in results is both a trust and a safety issue.

---

## 4. 🟡 Medium — degrades the experience

- **30-day access tokens, no real refresh rotation.** A stolen token is valid for a month. Shorten access-token life and lean on refresh.
- **`cors: { origin: '*' }`** is fine for an API consumed only by the app, but combined with cookie-less bearer tokens it's acceptable short-term; lock it down before any web surface handles auth.
- **OTP is stubbed** (`123456`, no SMS). Fine for dev, but signup currently sets `phoneVerified: true` with no actual verification — anyone can register any phone number, including impersonating a real one. Gate signup behind real OTP before launch.
- **No input validation layer.** Amounts aren't checked for negatives or absurd values server-side (`amount: naue * 100` from the client is trusted). A crafted request could create a negative-amount offer. Add schema validation (zod/Joi) and clamp money values.
- **Dispute auto-release race.** The 15-min cron auto-confirms `completed` jobs past `autoReleaseAt`. If a customer raises a dispute at minute 14, ensure the dispute flips status before the cron runs; otherwise funds could release on a disputed job. Verify ordering / add a guard (`status == 'completed'` re-check inside the transaction).
- **No pagination anywhere.** `getVendors`, offers, jobs all return full collections. Fine at 50 users, a problem at 5,000.
- **Error messages swallowed.** Most `catch` blocks return a generic `'Failed'`. You'll be debugging production blind. Log the real error (you do in some places, not others) and return a trace id.

---

## 5. 🟢 Polish & product

- Offers list / Jobs list have no "your turn" indicator — add it; it drives marketplace responsiveness.
- No notifications (push token is captured but unused). For a marketplace, "vendor got an offer" / "customer paid" notifications are core, not optional.
- No receipts / transaction detail view for customers (only vendors have a wallet ledger).
- Admin panel has no audit log — who approved/rejected which KYC, who ruled which dispute. For anything money-adjacent you want this.
- Mobile app: the fixes from the last pass (Account tab + sign-out, cross-platform PIN screen) are in and good. Remaining: production payment opens only an alert with a URL rather than the browser.

---

## 6. DevOps / operational readiness

| Area | State | Note |
|---|---|---|
| Boot resilience | 🟢 Good | Health-check-first, Firebase retry, routes mount regardless — genuinely well done |
| Secrets management | 🟠 | Env vars correct in code, but creds leaked via docs/GitHub |
| Observability | 🔴 | No error tracking (Sentry), no metrics, no alerting. A failed webhook is invisible |
| Backups | 🔴 | Firestore in **test mode** — no security rules, and no backup/export configured. Test-mode rules mean the DB is world-readable/writable if anyone gets the project config |
| Firestore security rules | 🔴 | Test mode = open. Even though access goes through your API, the DB itself must have locked-down rules |
| CI/CD | 🟠 | Manual zip-and-deploy. No automated tests, no staging environment |
| Rate limiting | 🟡 | Global 500/15min is coarse; add per-route limits on auth and payments |
| Rollback | 🟡 | Railway keeps deploys; document the rollback procedure |
| Load posture | 🟡 | No pagination + full-collection reads will raise Firestore costs and latency as you grow |

The **test-mode Firestore + no backups** combination is itself close to a blocker: one bad actor with the project config, or one accidental deletion, and there's no recovery.

---

## 7. What I'd do, in order

**Before any real money (pilot can run on dev/fake money now):**
1. Lock Firestore security rules; turn off test mode; enable daily backups/exports.
2. Wrap all balance changes in transactions / `increment()` (§2.1).
3. Build the real payout path with idempotency (§2.2).
4. Add payment verify endpoint + reconciliation sweep (§2.3).
5. Rotate admin creds, privatise repo, add `.gitignore` (§2.4).
6. Fix the `orderBy` string bug and Timestamp sorting (§3.1, §3.2); add composite indexes.

**Before public launch:**
7. Real OTP/SMS and phone verification gating signup (§4).
8. Server-side input validation + money clamping (§4).
9. Error tracking + alerting on webhook failures and 500s (§6).
10. Dispute/auto-release race guard inside a transaction (§4).
11. Pagination on list endpoints (§4).

**Soon after:**
12. Notifications, audit log, per-route rate limits, receipts.

---

## 8. Bottom line

You've built the right product with the right shape, and the boot/architecture work is better than most prototypes I see. But "in the hands of real users" with real money, the current build would leak money under concurrency, can debit a wallet without paying anyone, can lose a paid job if a webhook drops, and sits on an open, un-backed-up database. None of that is a redesign — it's a focused hardening pass on the money paths plus operational hygiene. Do §7's "before any real money" list and you move from "impressive demo" to "safe pilot." Do the rest and you're genuinely launch-ready.
