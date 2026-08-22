const TransactionRepo =
  require("../repositories/transaction.repo");

const UploadBatch =
  require("../models/UploadBatch");

const AuditLog =
  require("../models/AuditLog");
const crypto = require("crypto");

console.log("JOB STARTED");
exports.processTransactionUpload = async ({ records, user_id, hash, invalidCount, totalRecords, batchId }) => {
  try {
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

    return { inserted, batchId };
  } catch (err) {
    console.error("Job failed:", err.message);
    await UploadBatch.findByIdAndUpdate(batchId, { imported: 0, rejected: totalRecords, status: "FAILED" });
    await AuditLog.create({ user_id: user_id || null, action: "UPLOAD_FAILED", meta: { error: err.message, batch_id: batchId } });
    return null;
  }
};