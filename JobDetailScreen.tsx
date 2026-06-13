# Server
NODE_ENV=production
PORT=5000

# Firebase (copy from your service account JSON)
FIREBASE_PROJECT_ID=link-marketplace-581ce
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@link-marketplace-581ce.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

# JWT
JWT_SECRET=change_this_to_a_long_random_string_minimum_32_chars
JWT_REFRESH_SECRET=change_this_to_another_long_random_string
JWT_EXPIRES_IN=30d

# Admin (auto-created on first boot)
ADMIN_PHONE=08000000000
ADMIN_PASSWORD=LinkAdmin2026!
ADMIN_NAME=Link Admin

# Paystack (get from dashboard.paystack.com)
PAYSTACK_SECRET_KEY=sk_test_xxxx

# Platform rules
PLATFORM_FEE_PERCENT=10
MIN_WITHDRAWAL_NAIRA=2000
JOB_COMPLETION_WINDOW_HOURS=24
OFFER_EXPIRY_HOURS=2
