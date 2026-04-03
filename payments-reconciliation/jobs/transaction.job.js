const TransactionRepo =
  require("../repositories/transaction.repo");

const UploadBatch =
  require("../models/UploadBatch");

const AuditLog =
  require("../models/AuditLog");

exports.processTransactionUpload = async ({
  records,
  user_id,
  hash,
  invalidCount,
  totalRecords
}) => {

  // Normalize
  const normalized = records.map(r => ({
    ...r,
    amount: Number(r.amount),
    transaction_date: new Date(r.transaction_date),
    status: "UNMATCHED"
  }));

  // Insert
  const inserted = await TransactionRepo.bulkInsert(
    normalized,
    hash
  );

  // Batch
  const batch = await UploadBatch.create({
    user_id,
    type: "transaction",
    total_records: totalRecords,
    imported: inserted.length,
    rejected: invalidCount,
    status: "PENDING"
  });

 await AuditLog.create({
  user_id: user_id || null,
  action: "UPLOAD_TRANSACTION",
  meta: { batch_id: batch._id }
});

  return {
    inserted,
    batch
  };
};