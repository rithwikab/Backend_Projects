const TransactionRepo =
  require("../repositories/transaction.repo");

const UploadBatch =
  require("../models/UploadBatch");

const AuditLog =
  require("../models/AuditLog");
const crypto = require("crypto");


exports.processTransactionUpload = async ({
  records,
  user_id,
  hash,
  invalidCount,
  totalRecords
}) => {

  console.log("Processing records:", records.length);

  try {
    
    /* Normalize */
    const normalized = records.map(r => ({
  ...r,
  amount: Number(r.amount),
  transaction_date: new Date(r.transaction_date),
  status: "UNMATCHED",
  payload_hash: crypto
    .createHash("sha256")
    .update(
      `${r.reference_no}-${r.amount}-${r.transaction_date}`
    )
    .digest("hex")
}));

    /* Insert */
    const inserted = await TransactionRepo.bulkInsert(
      normalized
    );

    /* Batch */
    const batch = await UploadBatch.create({
      user_id,
      type: "transaction",
      total_records: totalRecords,
      imported: inserted.length,
      rejected: invalidCount,
      status: "PROCESSED"
    });

    /* Audit */
    await AuditLog.create({
      user_id: user_id || null,
      action: "UPLOAD_TRANSACTION",
      meta: { batch_id: batch._id }
    });

    console.log("Job completed");

    return { inserted, batch };
    
  } catch (err) {

  console.error("Job failed:", err.message);

  console.log("Retry recommended for batch"); // ✅ ADD HERE

  await UploadBatch.create({
    user_id: user_id || null,
    type: "transaction",
    total_records: totalRecords,
    imported: 0,
    rejected: totalRecords,
    status: "FAILED"
  });

  await AuditLog.create({
    user_id: user_id || null,
    action: "UPLOAD_FAILED",
    meta: { error: err.message }
  });

  return null;
}
};