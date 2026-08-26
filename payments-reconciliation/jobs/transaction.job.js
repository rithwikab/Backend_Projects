const TransactionRepo =
  require("../repositories/transaction.repo");

const UploadBatch =
  require("../models/UploadBatch");

const AuditLog =
  require("../models/AuditLog");
const crypto = require("crypto");

console.log("JOB STARTED");

/*
  NOTE: this function no longer has its own try/catch around the
  work. It used to (see git history / WEBHOOK_INTERVIEW_NOTES.md
  for the prior fire-and-forget version) — that catch immediately
  marked the UploadBatch as FAILED on the very first error.

  Now that this function is invoked by workers/transaction.worker.js
  as a BullMQ job processor, retry policy belongs at the queue
  layer, not here: if this function throws, BullMQ catches it,
  retries the job per queues/transactionQueue.js's configured
  attempts/backoff, and only calls the worker's 'failed' event
  (which marks UploadBatch as FAILED) once every attempt has been
  exhausted. This function's only job now is: succeed, or throw.
*/
exports.processTransactionUpload = async ({ records, user_id, hash, invalidCount, totalRecords, batchId }) => {
  const normalized = records.map(r => ({
    ...r,
    amount: Number(r.amount),
    transaction_date: new Date(r.transaction_date),
    status: "UNMATCHED",
    payload_hash: crypto.createHash("sha256")
      .update(`${r.reference_no}-${r.amount}-${r.transaction_date}`)
      .digest("hex")
  }));

  const inserted = await TransactionRepo.bulkInsert(normalized, batchId);

  await UploadBatch.findByIdAndUpdate(batchId, { imported: inserted.length, status: "PROCESSED" });
  await AuditLog.create({ user_id: user_id || null, action: "UPLOAD_TRANSACTION", meta: { batch_id: batchId } });

  return { inserted: inserted.length, batchId };
};