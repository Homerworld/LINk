const { getDoc, updateDoc, queryDocs } = require('../config/firebase');
const { releaseFunds } = require('./jobController');
const { ok, fail } = require('../utils/response');

exports.getDashboard = async (req, res) => {
  try {
    const [pendingKyc, openDisputes, vendors] = await Promise.all([
      queryDocs('users', [['role', '==', 'vendor'], ['kycStatus', '==', 'under_review']]),
      queryDocs('disputes', [['status', 'in', ['open', 'under_review']]]),
      queryDocs('users', [['role', '==', 'vendor'], ['kycStatus', '==', 'approved']]),
    ]);
    return ok(res, {
      stats: {
        pendingKyc: pendingKyc.length,
        openDisputes: openDisputes.length,
        verifiedVendors: vendors.length,
      },
      recentKyc: pendingKyc.slice(0, 5).map(v => ({
        id: v.id, fullName: v.fullName, phone: v.phone,
        services: v.services || [], kycSubmittedAt: v.kycSubmittedAt,
      })),
    });
  } catch (err) {
    return fail(res, 'Failed: ' + err.message);
  }
};

exports.getKycQueue = async (req, res) => {
  try {
    const { status = 'under_review' } = req.query;
    const vendors = await queryDocs('users', [['role', '==', 'vendor'], ['kycStatus', '==', status]]);
    return ok(res, vendors.map(v => ({
      id: v.id, fullName: v.fullName, phone: v.phone, email: v.email,
      kycStatus: v.kycStatus, kycSubmittedAt: v.kycSubmittedAt,
      idType: v.idType, idDocumentUrl: v.idDocumentUrl, selfieUrl: v.selfieUrl,
      bankName: v.bankName, accountNumber: v.accountNumber, accountName: v.accountName,
      locationArea: v.locationArea, services: v.services || [],
      kycRejectionReason: v.kycRejectionReason,
    })));
  } catch (err) {
    return fail(res, 'Failed');
  }
};

exports.reviewKyc = async (req, res) => {
  try {
    const { action, reason } = req.body;
    const statusMap = { approve: 'approved', reject: 'rejected', request_info: 'info_requested' };
    await updateDoc('users', req.params.id, {
      kycStatus: statusMap[action],
      kycReviewedAt: new Date().toISOString(),
      kycRejectionReason: reason || null,
    });
    return ok(res, {}, `KYC ${action}d`);
  } catch { return fail(res, 'Failed'); }
};

exports.getDisputes = async (req, res) => {
  try {
    const disputes = await queryDocs('disputes', [['status', 'in', ['open', 'under_review', 'evidence_submitted']]]);
    return ok(res, disputes);
  } catch { return fail(res, 'Failed'); }
};

exports.ruleDispute = async (req, res) => {
  try {
    const { ruling, rulingSplit, rulingNotes } = req.body;
    const dispute = await getDoc('disputes', req.params.id);
    if (!dispute) return fail(res, 'Not found', 404);

    await updateDoc('disputes', dispute.id, {
      status: 'resolved', ruling, rulingSplit: rulingSplit || null,
      rulingNotes: rulingNotes || null, ruledAt: new Date().toISOString(),
    });

    const job = await getDoc('jobs', dispute.jobId);
    if (ruling === 'full_payment') {
      await updateDoc('jobs', job.id, { status: 'confirmed' });
      await releaseFunds(job);
    } else if (ruling === 'full_refund') {
      await updateDoc('jobs', job.id, { status: 'refunded' });
      const vendor = await getDoc('users', job.vendorId);
      await updateDoc('users', job.vendorId, { escrowBalance: Math.max(0, (vendor.escrowBalance || 0) - job.vendorPayout) });
    } else if (ruling === 'partial_split') {
      const vendorPct = 100 - (rulingSplit || 50);
      const vendorAmount = Math.round(job.vendorPayout * vendorPct / 100);
      await updateDoc('jobs', job.id, { status: 'confirmed', vendorPayout: vendorAmount });
      await releaseFunds({ ...job, vendorPayout: vendorAmount });
    }

    return ok(res, {}, 'Dispute ruled');
  } catch (err) {
    return fail(res, 'Failed: ' + err.message);
  }
};

exports.getVendors = async (req, res) => {
  try {
    const vendors = await queryDocs('users', [['role', '==', 'vendor']]);
    return ok(res, vendors.map(v => ({
      id: v.id, fullName: v.fullName, phone: v.phone, email: v.email,
      isActive: v.isActive, kycStatus: v.kycStatus,
      avgRating: v.avgRating, totalJobs: v.totalJobs,
      locationArea: v.locationArea, services: v.services || [],
    })));
  } catch { return fail(res, 'Failed'); }
};

exports.updateVendorStatus = async (req, res) => {
  try {
    const { action } = req.body;
    await updateDoc('users', req.params.id, { isActive: action === 'reinstate' });
    return ok(res, {}, `Vendor ${action}d`);
  } catch { return fail(res, 'Failed'); }
};
