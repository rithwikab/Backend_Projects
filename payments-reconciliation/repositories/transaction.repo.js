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

exports.bulkInsert = async (records, batchId) => {
  const docs = records.map(r => ({
    ...r,
    amount: Number(r.amount),
    status: "UNMATCHED",
    upload_batch_id: batchId
  }));

  try {
    return await Transaction.insertMany(docs, { ordered: false });
  } catch (err) {
    /*
      FIXED BUG: insertMany with {ordered:false} still REJECTS the
      whole call if ANY document fails the unique payload_hash
      index — even though every non-conflicting document was
      already persisted to MongoDB before the rejection. That used
      to mean a batch with 1 duplicate among 50 new records got
      marked entirely FAILED, discarding an accurate count of what
      actually succeeded (confirmed via a real test run — see
      Queue.e2e.test.js).

      A duplicate here is an EXPECTED, idempotent outcome — that's
      the entire point of payload_hash's unique index — not a
      genuine failure. So: distinguish "the only failures were
      duplicates" from a real error, and return what actually
      succeeded instead of throwing. A genuine (non-duplicate)
      error still throws, so BullMQ's retry logic is unaffected for
      real failures.
    */
    const writeErrors = err.writeErrors || [];
    const allFailuresAreDuplicates =
      err.code === 11000 ||
      (writeErrors.length > 0 && writeErrors.every(e => e.code === 11000));

    if (allFailuresAreDuplicates) {
      // Mongoose attaches the documents that DID succeed to the
      // thrown error as insertedDocs when ordered:false is used.
      return err.insertedDocs || [];
    }

    throw err;
  }
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