const { getDoc, updateDoc, queryDocs, addDoc, deleteDoc } = require('../config/firebase');
const { ok, fail } = require('../utils/response');

exports.getStatus = async (req, res) => {
  try {
    const user = await getDoc('users', req.user.userId);
    return ok(res, {
      kycStatus: user.kycStatus || 'pending',
      kycRejectionReason: user.kycRejectionReason || null,
      idType: user.idType || null,
      idDocumentUrl: user.idDocumentUrl || null,
      selfieUrl: user.selfieUrl || null,
      bankName: user.bankName || null,
      accountNumber: user.accountNumber || null,
      accountName: user.accountName || null,
      locationArea: user.locationArea || null,
      services: user.services || [],
      portfolioImages: user.portfolioImages || [],
    });
  } catch { return fail(res, 'Failed'); }
};

exports.submitIdentity = async (req, res) => {
  try {
    const { idType, bankCode, bankName, accountNumber } = req.body;
    // In production verify with Paystack — for now trust the input
    await updateDoc('users', req.user.userId, {
      idType, bankCode, bankName, accountNumber,
      accountName: req.body.accountName || 'Account Holder',
    });
    return ok(res, { accountName: req.body.accountName }, 'Identity submitted');
  } catch { return fail(res, 'Failed'); }
};

exports.addServices = async (req, res) => {
  try {
    const { services } = req.body;
    if (!Array.isArray(services) || services.length === 0) return fail(res, 'Select at least one service', 400);
    if (services.length > 4) return fail(res, 'Maximum 4 services', 400);
    await updateDoc('users', req.user.userId, { services });
    return ok(res, {}, 'Services updated');
  } catch { return fail(res, 'Failed'); }
};

exports.updateLocation = async (req, res) => {
  try {
    const { locationArea, locationType, latitude, longitude, availabilityText, priceMin, priceMax, priceNegotiable } = req.body;
    await updateDoc('users', req.user.userId, {
      locationArea, locationType, latitude: latitude || null, longitude: longitude || null,
      availabilityText, priceMin: priceMin || null, priceMax: priceMax || null,
      priceNegotiable: priceNegotiable !== false,
    });
    return ok(res, {}, 'Location updated');
  } catch { return fail(res, 'Failed'); }
};

exports.submit = async (req, res) => {
  try {
    await updateDoc('users', req.user.userId, {
      kycStatus: 'under_review',
      kycSubmittedAt: new Date().toISOString(),
    });
    return ok(res, {}, 'KYC submitted. You will be notified within 24-48 hours.');
  } catch { return fail(res, 'Failed'); }
};
