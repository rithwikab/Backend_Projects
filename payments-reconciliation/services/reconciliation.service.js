const Expected = require("../models/ExpectedPayment");
const Transaction = require("../models/Transaction");
const Reconciliation = require("../models/Reconciliation");
const UploadBatch =
  require("../models/UploadBatch");
const {
  reconcilePayments
} = require("./reconciliation.logic");

const cache =
  require("./reconciliationSummary.cache");
const AuditLog =
  require("../models/AuditLog");

/*
  Run reconciliation and persist results
*/
exports.runReconciliation = async () => {

  /* ---------------- Fetch Data ---------------- */

  const expected = await Expected.find({
    status: { $in: ["PENDING", "PARTIAL"] }
  });

  const transactions = await Transaction.find({
    status: "UNMATCHED"
  });

  if (!expected.length || !transactions.length) {

    return {
      message: "Nothing to reconcile"
    };
  }

  /* ---------------- Run Logic ---------------- */

  const results =
    reconcilePayments(expected, transactions);

  /* ---------------- Persist ---------------- */

  const reconDocs = [];

  for (const r of results) {

    reconDocs.push({
  expected_payment_id: r.expectedId,
  actual_transaction_ids: r.transactionIds || [],
  status: r.status,
  variance_amount: r.variance,
  method: "AUTO"
});


    /* Update Expected */

    await Expected.updateOne(
      { _id: r.expectedId },
      {
        status: mapExpectedStatus(r.status)
      }
    );

    /* Update Transactions */

    if (
      Array.isArray(r.transactionIds) &&
      r.transactionIds.length > 0
    ) {

      await Transaction.updateMany(
        { _id: { $in: r.transactionIds } },
        { status: "MATCHED" }
      );
    }
  }

  /* ---------------- Save Recon ---------------- */

  if (reconDocs.length > 0) {

    await Reconciliation.insertMany(reconDocs);
        // Mark all pending batches as processed
    await UploadBatch.updateMany(
      { status: "PENDING" },
      { status: "PROCESSED" }
    );  
  }
//   await AuditLog.create({
//   user_id: null, // optional if not passing req
//   action: "RUN_RECONCILIATION",
//   meta: { reconciled: reconDocs.length }
// });

  /* ---------------- Clear Cache ---------------- */

  cache.clear("recon-summary");

  return {
    reconciled: reconDocs.length
  };
};


/* =================================================
   STATUS MAPPER
================================================= */

function mapExpectedStatus(status) {

  switch (status) {

    case "PERFECT_MATCH":
    case "AGGREGATED_MATCH":
      return "PAID";

    case "PARTIAL_MATCH":
      return "PARTIAL";

    case "MISSING":
      return "PENDING";

    default:
      return "PENDING";
  }
}


/* =================================================
   DASHBOARD SUMMARY
================================================= */

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
