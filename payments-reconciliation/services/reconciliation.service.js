const Expected = require("../models/ExpectedPayment");
const Transaction = require("../models/Transaction");
const Reconciliation = require("../models/Reconciliation");
const UploadBatch = require("../models/UploadBatch");

const {
  reconcilePayments
} = require("./reconciliation.logic");

const cache =
  require("./reconciliationSummary.cache");

/*
  Run reconciliation
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
  const transactionIdsToUpdate = [];

  for (const r of results) {

    reconDocs.push({
      expected_payment_id: r.expectedId,
      actual_transaction_ids: r.transactionIds || [],
      status: r.status,
      variance_amount: r.variance,
      method: "AUTO"
    });

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
    // keep transactions reusable
    await Transaction.updateMany(
      { _id: { $in: r.transactionIds } },
      { status: "PARTIAL" }
    );
  } else {
    transactionIdsToUpdate.push(...r.transactionIds);
  }
}
  }

  /* Bulk DB operations (VERY IMPORTANT IMPROVEMENT) */

  if (reconDocs.length) {

    await Reconciliation.insertMany(reconDocs);

    await Expected.bulkWrite(expectedUpdates);

    if (transactionIdsToUpdate.length) {
      await Transaction.updateMany(
        { _id: { $in: transactionIdsToUpdate } },
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

  return {
    reconciled: reconDocs.length
  };
};


/* STATUS MAPPING */

function mapExpectedStatus(status) {
  switch (status) {
    case "PERFECT_MATCH":
    case "AGGREGATED_MATCH":
    case "AMOUNT_MATCH":
      return "PAID";

    case "PARTIAL_MATCH":
      return "PARTIAL";

    default:
      return "PENDING";
  }
}


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

  const result = {
    matched,
    partial,
    missing,
    unmatched
  };

  cache.set(key, result);

  return result;
};