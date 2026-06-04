const { queryDocs, getDoc } = require('../config/firebase');
const { ok, fail } = require('../utils/response');

exports.getServices = async (req, res) => {
  try {
    const services = await queryDocs('services', [['isActive', '==', true]], 'name');
    return ok(res, services);
  } catch (err) {
    return fail(res, 'Failed to get services');
  }
};

exports.autocomplete = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return ok(res, []);
    const all = await queryDocs('services', [['isActive', '==', true]]);
    const filtered = all.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    return ok(res, filtered);
  } catch (err) {
    return fail(res, 'Autocomplete failed');
  }
};

exports.searchVendors = async (req, res) => {
  try {
    const { service, limit = 20 } = req.query;

    let conditions = [['role', '==', 'vendor'], ['kycStatus', '==', 'approved'], ['isActive', '==', true]];
    if (service) conditions.push(['services', 'array-contains', service]);

    const vendors = await queryDocs('users', conditions, null, parseInt(limit));

    const safeVendors = vendors.map(v => ({
      id: v.id,
      fullName: v.fullName,
      locationArea: v.locationArea,
      services: v.services || [],
      avgRating: v.avgRating || 0,
      totalReviews: v.totalReviews || 0,
      totalJobs: v.totalJobs || 0,
      priceMin: v.priceMin,
      priceMax: v.priceMax,
      priceNegotiable: v.priceNegotiable !== false,
      isOnline: v.isOnline || false,
      coverImage: v.coverImage || null,
    }));

    return ok(res, safeVendors);
  } catch (err) {
    return fail(res, 'Search failed: ' + err.message);
  }
};

exports.getVendorProfile = async (req, res) => {
  try {
    const vendor = await getDoc('users', req.params.id);
    if (!vendor || vendor.role !== 'vendor' || vendor.kycStatus !== 'approved') {
      return fail(res, 'Vendor not found', 404);
    }
    const { passwordHash, withdrawalPinHash, pushToken, ...safe } = vendor;
    return ok(res, safe);
  } catch (err) {
    return fail(res, 'Failed to get vendor');
  }
};
