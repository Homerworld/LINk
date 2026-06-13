const { getDoc, updateDoc, queryDocs, addDoc, runTransaction, increment } = require('../config/firebase');
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
    const jobId = req.params.id;
    const userId = req.user.userId;
    // Everything atomic: re-check status inside the transaction so a
    // simultaneous dispute or auto-release can't double-release funds.
    const result = await runTransaction(async (tx, { txGet, txUpdate }) => {
      const job = await txGet('jobs', jobId);
      if (!job || job.customerId !== userId) throw new Error('Job not found');
      if (job.status !== 'completed') throw new Error('Job cannot be confirmed in its current state');

      const vendor = await txGet('users', job.vendorId);
      if (!vendor) throw new Error('Vendor not found');

      txUpdate('jobs', jobId, { status: 'confirmed', confirmedAt: new Date().toISOString() });
      // Move payout out of escrow into available, atomically.
      txUpdate('users', job.vendorId, {
        escrowBalance: increment(-job.vendorPayout),
        availableBalance: increment(job.vendorPayout),
        totalEarned: increment(job.vendorPayout),
        totalJobs: increment(1),
      });
      return true;
    });
    return ok(res, {}, 'Job confirmed. Payment released to vendor.');
  } catch (err) {
    logger.error('confirmJob: ' + err.message);
    return fail(res, err.message || 'Failed to confirm', 400);
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

// Atomic release used by the auto-release cron. Re-checks status inside the
// transaction and flips the job to confirmed itself, so it can never race
// with a manual confirm or a dispute.
const releaseFunds = async (jobOrId) => {
  const jobId = typeof jobOrId === 'string' ? jobOrId : jobOrId.id;
  await runTransaction(async (tx, { txGet, txUpdate }) => {
    const job = await txGet('jobs', jobId);
    if (!job) return;
    // Only release jobs still sitting in 'completed'. If a dispute or a manual
    // confirm already moved it, do nothing.
    if (job.status !== 'completed') return;

    const vendor = await txGet('users', job.vendorId);
    if (!vendor) return;

    txUpdate('jobs', jobId, { status: 'confirmed', confirmedAt: new Date().toISOString(), autoReleased: true });
    txUpdate('users', job.vendorId, {
      escrowBalance: increment(-job.vendorPayout),
      availableBalance: increment(job.vendorPayout),
      totalEarned: increment(job.vendorPayout),
      totalJobs: increment(1),
    });
  });
};

module.exports.releaseFunds = releaseFunds;
