# Link — Full Bundle (Mobile App + Admin Panel)

This bundle has two parts:

- **`frontend/`** — the Link mobile app (runs on your phone via Expo Go)
- **`admin/`** — the Link admin panel (runs in your web browser)

Both already point at your live backend. Nothing to configure.

---

## Part 1 — Mobile app (your phone)

You already have this running. This version adds the fixes from the QA pass:
- **Account tab** for BOTH customers and vendors — with sign-out (no more being trapped)
- **Set PIN screen** that works on iPhone *and* Android (the old one was iPhone-only)
- Vendors can reach their KYC/services from the Account tab
- A refresh button on the negotiation screen

### To update your running app
In your `frontend` folder:
1. Replace the old `frontend` files with these new ones (or just replace the `src` folder and `package.json`).
2. If the app is running, it hot-reloads automatically. If not:
   ```
   npx expo start -c
   ```
   then scan the QR with your iPhone camera.

No reinstall needed unless `package.json` changed — and it didn't change versions this time, only the app code.

---

## Part 2 — Admin panel (your browser)

This is where you **approve vendors** so they show up in customer search — the missing piece that unlocks full end-to-end testing.

### First-time setup (one time, ~2 min)
1. Open a **new** Command Prompt window.
2. Go into the admin folder:
   ```
   cd Desktop\admin
   ```
   (adjust the path to wherever you unzip it)
3. Install:
   ```
   npm install
   ```
4. Start it:
   ```
   npm run dev
   ```
5. It prints a line like `Local: http://localhost:5173/`. Open that in your browser (Chrome, Edge, whatever).

### Log in
- Phone: `08140439590`
- Password: `LinkAdmin2026!`

### What you can do
- **Dashboard** — see how many vendors are waiting, open disputes, verified vendors
- **KYC review** — approve / reject / request-info on vendors (this is the key one)
- **Disputes** — rule on disputes: full refund, split, or full payment
- **Vendors** — see every vendor, suspend or reinstate them

---

## The full test flow (once both are running)

1. **Mobile:** sign up as a vendor → fill KYC (services, area, bank) → Submit for review.
2. **Admin (browser):** go to KYC review → approve that vendor.
3. **Mobile:** sign up as a customer (second phone, or sign out and make a new account) → search the service the vendor offers → they now appear.
4. **Mobile:** make an offer → negotiate → accept → pay (auto-confirms in test mode).
5. **Mobile:** vendor marks the job complete → customer confirms → money moves to the vendor's wallet.
6. **Mobile:** vendor sets a PIN (Account or Wallet) → withdraws.

That's the entire marketplace, working end to end.
