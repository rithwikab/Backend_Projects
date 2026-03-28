const ExpectedPayment = require("../models/ExpectedPayment");

/*
  Check if batch already imported
*/
exports.checkImportHash = async (hash) => {
  return await ExpectedPayment.exists({ import_hash: hash });
};

/*
  Bulk insert expected payments
*/
exports.bulkInsert = async (records, hash, userId) => {

  const docs = records.map(r => ({
    ...r,
    amount: Number(r.amount),
    status: "PENDING",
    import_hash: hash,
    created_by: userId
  }));

  return await ExpectedPayment.insertMany(docs, {
    ordered: false
  });
};
