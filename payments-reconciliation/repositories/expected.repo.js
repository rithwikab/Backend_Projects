const ExpectedPayment = require("../models/ExpectedPayment");
/*
  Bulk insert expected payments
*/
exports.bulkInsert = async (records, hash, userId, batchId) => {
  const docs = records.map(r => ({
    ...r,
    amount: Number(r.amount),
    status: "PENDING",
    import_hash: hash,
    created_by: userId,
    upload_batch_id: batchId
  }));
  return await ExpectedPayment.insertMany(docs, { ordered: false });
};
