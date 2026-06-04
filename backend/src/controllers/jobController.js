const { getDoc, updateDoc, queryDocs, addDoc } = require('../config/firebase');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

const COMPLETION_HOURS = parseInt(process.env.JOB_COMPLETION_WINDOW_HOURS) || 24;

exports.getMyJobs = async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.user.userId;
    const asCustomer = await queryDocs('jobs', [['customerId', '==', userId]]);
    const asVendor = await queryDocs('jobs', [['vendorId', '==', userId]]);
    let all = [...asCustomer, ...asVendor].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (status) all = all.filter(j => j.status === status);
    return ok(res, all);
  } catch (err) {
    return fail(res, 'Failed to get jobs');
  }
};

exports.getJob = async (req, res) => {
  try {
    const job = await getDoc('jobs', req.params.id);
    if (!job) return fail(res, 'Job not found', 404);
    if (job.customerId !== req.user.userId && job.vendorId !== req.user.userId) return fail(res, 'Not authorized', 403);
    return ok(res, job);
  } catch {
    return fail(res, 'Failed');
  }
};

exports.markComplete = async (req, res) => {
  try {
    const job = await getDoc('jobs', req.params.id);
    if (!job || job.vendorId !== req.user.userId || job.status !== 'active') return fail(res, 'Job not found or cannot be completed', 404);
    const autoReleaseAt = new Date(Date.now() + COMPLETION_HOURS * 3600000).toISOString();
    await updateDoc('jobs', job.id, { status: 'completed', completedAt: new Date().toISOString(), autoReleaseAt });
    return ok(res, {}, `Job marked complete. Customer has ${COMPLETION_HOURS} hours to confirm.`);
  } catch (err) {
    return fail(res, 'Failed');
  }
};

exports.confirmJob = async (req, res) => {
  try {
    const job = await getDoc('jobs', req.params.id);
    if (!job || job.customerId !== req.user.userId || job.status !== 'completed') return fail(res, 'Job not found or cannot be confirmed', 404);
    await updateDoc('jobs', job.id, { status: 'confirmed', confirmedAt: new Date().toISOString() });
    await releaseFunds(job);
    return ok(res, {}, 'Job confirmed. Payment released to vendor.');
  } catch (err) {
    logger.error('confirmJob: ' + err.message);
    return fail(res, 'Failed to confirm');
  }
};

exports.raiseDispute = async (req, res) => {
  try {
    const { issue, description } = req.body;
    const job = await getDoc('jobs', req.params.id);
    if (!job || job.customerId !== req.user.userId || !['active', 'completed'].includes(job.status)) return fail(res, 'Cannot dispute this job', 404);
    const existing = await queryDocs('disputes', [['jobId', '==', job.id]], null, 1);
    if (existing.length > 0) return fail(res, 'Dispute already raised', 409);
    await updateDoc('jobs', job.id, { status: 'disputed' });
    const dispute = await addDoc('disputes', {
      jobId: job.id, raisedBy: req.user.userId, issue, description: description || null,
      status: 'open', customerName: job.customerName, vendorName: job.vendorName,
      agreedAmount: job.agreedAmount, serviceName: job.serviceName,
      deadlineAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    });
    return ok(res, dispute, 'Dispute raised. Support will review within 48 hours.', 201);
  } catch (err) {
    return fail(res, 'Failed to raise dispute');
  }
};

exports.submitReview = async (req, res) => {
  try {
    const { rating, review } = req.body;
    const job = await getDoc('jobs', req.params.id);
    if (!job || job.status !== 'confirmed') return fail(res, 'Cannot review this job', 404);
    const isCustomer = job.customerId === req.user.userId;
    if (!isCustomer && job.vendorId !== req.user.userId) return fail(res, 'Not authorized', 403);
    if (isCustomer) {
      await updateDoc('jobs', job.id, { customerRating: rating, customerReview: review || null });
      // Update vendor avg rating
      const vendorJobs = await queryDocs('jobs', [['vendorId', '==', job.vendorId], ['status', '==', 'confirmed']]);
      const rated = vendorJobs.filter(j => j.customerRating);
      const avg = rated.length > 0 ? rated.reduce((s, j) => s + j.customerRating, 0) / rated.length : 0;
      await updateDoc('users', job.vendorId, { avgRating: Math.round(avg * 10) / 10, totalReviews: rated.length });
    } else {
      await updateDoc('jobs', job.id, { vendorReview: review || null });
    }
    return ok(res, {}, 'Review submitted');
  } catch (err) {
    return fail(res, 'Failed to submit review');
  }
};

const releaseFunds = async (job) => {
  const vendor = await getDoc('users', job.vendorId);
  const newEscrow = Math.max(0, (vendor.escrowBalance || 0) - job.vendorPayout);
  const newAvailable = (vendor.availableBalance || 0) + job.vendorPayout;
  const newTotal = (vendor.totalEarned || 0) + job.vendorPayout;
  const newJobs = (vendor.totalJobs || 0) + 1;
  await updateDoc('users', job.vendorId, {
    escrowBalance: newEscrow,
    availableBalance: newAvailable,
    totalEarned: newTotal,
    totalJobs: newJobs,
  });
};

module.exports.releaseFunds = releaseFunds;
