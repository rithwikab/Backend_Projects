const Expected = require("../models/ExpectedPayment");
const Transaction = require("../models/Transaction");
const Reconciliation = require("../models/Reconciliation");
const UploadBatch = require("../models/UploadBatch");

const {
  reconcilePayments
} = require("./reconciliation.logic");

const cache =
  require("./reconciliationSummary.cache");

const {
  decodeCursor,
  buildMongoQuery,
  paginateResults,
  DEFAULT_LIMIT
} = require("../utils/pagination");

/*
  Run reconciliation

  CHANGED: results are now split by requiresReview (see
  reconciliation.logic.js). High-confidence, reference-based
  matches (Rules 1 & 2) are committed immediately, exactly like
  before. Low-confidence, amount-only matches (Rules 3 & 4) are
  recorded as PENDING_REVIEW — a Reconciliation document is created
  so the suggestion is visible, but the underlying
  ExpectedPayment/Transaction are left untouched until a human
  confirms via confirmSuggestedMatch() below.

  Also fixed a real inefficiency while rewriting this: the original
  version updated PARTIAL_MATCH transactions with an individually
  awaited Transaction.updateMany() call INSIDE the main loop (one
  DB round trip per partially-matched invoice), while MATCHED
  transactions were correctly batched into one call at the end.
  Both are now batched together at the end, consistent with the
  rest of this function's "batch writes, don't loop" approach.
*/
exports.runReconciliation = async () => {

  /* Fetch only required data */
  const expected = await Expected.find({
    status: { $in: ["PENDING", "PARTIAL"] }
  });

  const transactions = await Transaction.find({
     status: { $in: ["UNMATCHED", "PARTIAL"] }
  });

  if (!expected.length || !transactions.length) {
    return { message: "Nothing to reconcile" };
  }

  /* Run matching logic */
  const results =
    reconcilePayments(expected, transactions);

  const reconDocs = [];

  const expectedUpdates = [];
  const transactionIdsToMatch = [];
  const transactionIdsToPartial = [];

  for (const r of results) {

    const isSuggested = r.requiresReview === true;

    reconDocs.push({
      expected_payment_id: r.expectedId,
      actual_transaction_ids: r.transactionIds || [],
      status: r.status,
      variance_amount: r.variance,
      method: "AUTO",
      review_status: isSuggested ? "PENDING_REVIEW" : "AUTO_CONFIRMED"
    });

    if (isSuggested) {
      // Do NOT touch Expected/Transaction yet — this is only a
      // suggestion until a human confirms it.
      continue;
    }

    expectedUpdates.push({
      updateOne: {
        filter: { _id: r.expectedId },
        update: {
          status: mapExpectedStatus(r.status)
        }
      }
    });

    if (r.transactionIds?.length) {
      if (r.status === "PARTIAL_MATCH") {
        transactionIdsToPartial.push(...r.transactionIds);
      } else {
        transactionIdsToMatch.push(...r.transactionIds);
      }
    }
  }

  /* Bulk DB operations */

  if (reconDocs.length) {

    await Reconciliation.insertMany(reconDocs);

    if (expectedUpdates.length) {
      await Expected.bulkWrite(expectedUpdates);
    }

    if (transactionIdsToPartial.length) {
      await Transaction.updateMany(
        { _id: { $in: transactionIdsToPartial } },
        { status: "PARTIAL" }
      );
    }

    if (transactionIdsToMatch.length) {
      await Transaction.updateMany(
        { _id: { $in: transactionIdsToMatch } },
        { status: "MATCHED" }
      );
    }

    const touchedBatchIds = [...new Set(expected.map(e => e.upload_batch_id?.toString()).filter(Boolean))];
    if (touchedBatchIds.length) {
      await UploadBatch.updateMany(
        { _id: { $in: touchedBatchIds }, status: "PENDING" },
        { status: "PROCESSED" }
      );
    }
  }

  /* Clear cache */
  cache.clear("recon-summary");

  const pendingReviewCount = reconDocs.filter(d => d.review_status === "PENDING_REVIEW").length;

  return {
    reconciled: reconDocs.length,
    autoConfirmed: reconDocs.length - pendingReviewCount,
    pendingReview: pendingReviewCount
  };
};


/* STATUS MAPPING */

function mapExpectedStatus(status) {
  switch (status) {
    case "PERFECT_MATCH":
    case "AGGREGATED_MATCH":
    case "AMOUNT_MATCH":
    case "AGGREGATED_AMOUNT_MATCH":
      return "PAID";

    case "PARTIAL_MATCH":
      return "PARTIAL";

    default:
      return "PENDING";
  }
}


/* ===============================
   SUGGESTED MATCH REVIEW WORKFLOW (NEW)
================================ */

exports.listPendingReview = async ({ cursor, limit }) => {

  const parsedCursor = decodeCursor(cursor);

  const baseFilter = { review_status: "PENDING_REVIEW" };

  const query = buildMongoQuery(baseFilter, parsedCursor);

  const finalLimit = Math.min(parseInt(limit) || DEFAULT_LIMIT, 100);

  const rows = await Reconciliation
    .find(query)
    .populate("expected_payment_id")
    .populate("actual_transaction_ids")
    .sort({ createdAt: -1, _id: -1 })
    .limit(finalLimit + 1);

  return paginateResults(rows, finalLimit);
};

exports.confirmSuggestedMatch = async (reconciliationId, userId) => {

  const recon = await Reconciliation.findById(reconciliationId);

  if (!recon) {
    const err = new Error("Reconciliation record not found");
    err.statusCode = 404;
    throw err;
  }

  if (recon.review_status !== "PENDING_REVIEW") {
    const err = new Error(`Cannot confirm a match with review_status "${recon.review_status}"`);
    err.statusCode = 409;
    throw err;
  }

  await Expected.findByIdAndUpdate(recon.expected_payment_id, {
    status: mapExpectedStatus(recon.status)
  });

  if (recon.actual_transaction_ids?.length) {
    await Transaction.updateMany(
      { _id: { $in: recon.actual_transaction_ids } },
      { status: "MATCHED" }
    );
  }

  recon.review_status = "CONFIRMED";
  recon.matched_by = userId || null;
  await recon.save();

  cache.clear("recon-summary");

  return recon;
};

exports.rejectSuggestedMatch = async (reconciliationId, userId, remarks) => {

  const recon = await Reconciliation.findById(reconciliationId);

  if (!recon) {
    const err = new Error("Reconciliation record not found");
    err.statusCode = 404;
    throw err;
  }

  if (recon.review_status !== "PENDING_REVIEW") {
    const err = new Error(`Cannot reject a match with review_status "${recon.review_status}"`);
    err.statusCode = 409;
    throw err;
  }

  // Expected/Transaction were never touched for a suggested match —
  // rejecting just means leaving them exactly as they are (still
  // PENDING/UNMATCHED), eligible to be matched again by a future
  // reconciliation run or a different transaction/invoice.
  recon.review_status = "REJECTED";
  recon.matched_by = userId || null;
  if (remarks) recon.remarks = remarks;
  await recon.save();

  return recon;
};


/* DASHBOARD SUMMARY */

exports.getReconciliationSummary = async () => {

  const key = "recon-summary";

  const cached = cache.get(key);
  if (cached) return cached;

  const matched =
    await Expected.countDocuments({ status: "PAID" });

  const partial =
    await Expected.countDocuments({ status: "PARTIAL" });

  const missing =
    await Expected.countDocuments({ status: "PENDING" });

  const unmatched =
    await Transaction.countDocuments({
      status: "UNMATCHED"
    });

  const pendingReview =
    await Reconciliation.countDocuments({
      review_status: "PENDING_REVIEW"
    });

  const result = {
    matched,
    partial,
    missing,
    unmatched,
    pendingReview
  };

  cache.set(key, result);

  return result;
};