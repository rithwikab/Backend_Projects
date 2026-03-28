const Transaction =
  require("../models/Transaction");


/* ===============================
   Check Duplicate Import
================================ */

exports.checkHash = async (hash) => {

  return await Transaction.exists({
    payload_hash: hash
  });
};


/* ===============================
   Bulk Insert
================================ */

exports.bulkInsert = async (
  records,
  hash
) => {

  const docs = records.map(r => ({

    ...r,

    amount: Number(r.amount),

    status: "UNMATCHED",

    payload_hash: hash
  }));

  return await Transaction.insertMany(
    docs,
    { ordered: false }
  );
};
