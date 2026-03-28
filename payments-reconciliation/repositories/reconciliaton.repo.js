const {
  decodeCursor,
  buildMongoQuery,
  paginateResults,
  DEFAULT_LIMIT
} = require("../utils/pagination");

exports.listReconciliations = async (
  filters,
  cursor,
  limit = DEFAULT_LIMIT
) => {

  const cursorObj = decodeCursor(cursor);

  const query = buildMongoQuery(filters, cursorObj);

  const rows = await Reconciliation
    .find(query)
    .sort({ created_at: -1, _id: -1 })
    .limit(limit + 1);

  return paginateResults(rows, limit);
};
