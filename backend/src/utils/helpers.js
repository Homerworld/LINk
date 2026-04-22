const { v4: uuidv4 } = require('uuid');

// Generate job reference e.g. LNK-2026-AB3X9K
const generateJobReference = () => {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LNK-${year}-${code}`;
};

// Convert naira to kobo
const toKobo = (naira) => Math.round(naira * 100);

// Convert kobo to naira
const toNaira = (kobo) => kobo / 100;

// Format naira for display
const formatNaira = (kobo) => {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Calculate platform fee and vendor payout
const calculateFees = (agreedAmountKobo) => {
  const feePercent = parseInt(process.env.PLATFORM_FEE_PERCENT || '10');
  const platformFee = Math.round(agreedAmountKobo * (feePercent / 100));
  const vendorPayout = agreedAmountKobo - platformFee;
  return { platformFee, vendorPayout };
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Add hours to a date
const addHours = (date, hours) => {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
};

// Add days to a date
const addDays = (date, days) => {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
};

// Mask phone number for display
const maskPhone = (phone) => {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 4) + '****' + phone.slice(-3);
};

// Mask account number
const maskAccount = (account) => {
  if (!account || account.length < 4) return account;
  return '****' + account.slice(-4);
};

// Calculate distance between two GPS coordinates (km)
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Format distance for display
const formatDistance = (km) => {
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)}km away`;
};

// Paginate query results
const paginate = (page = 1, limit = 20) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  return { limit: parseInt(limit), offset };
};

module.exports = {
  generateJobReference,
  toKobo, toNaira, formatNaira,
  calculateFees,
  generateOTP,
  addHours, addDays,
  maskPhone, maskAccount,
  calculateDistance, formatDistance,
  paginate,
};
