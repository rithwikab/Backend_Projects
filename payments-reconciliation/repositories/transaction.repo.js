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
const {
  decodeCursor,
  buildMongoQuery,
  paginateResults,
  DEFAULT_LIMIT
} = require("../utils/pagination");

/* ===============================
   Get Paginated Transactions
================================ */

exports.getPaginatedTransactions = async ({
  cursor,
  limit,
  status
}) => {

  const parsedCursor = decodeCursor(cursor);

  const baseFilter = {};

  if (status) {
    baseFilter.status = status;
  }

  const query = buildMongoQuery(
    baseFilter,
    parsedCursor
  );

  const finalLimit = Math.min(
    parseInt(limit) || DEFAULT_LIMIT,
    100
  );

  const rows = await Transaction
    .find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(finalLimit + 1); // +1 for hasMore

  return paginateResults(rows, finalLimit);
};