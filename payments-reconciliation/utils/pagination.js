
const DEFAULT_LIMIT = 25;

/* ---------------------------------------------
   Encode Cursor
--------------------------------------------- */
function encodeCursor(createdAt, id) {
  const payload = `${createdAt.toISOString()}|${id}`;
  return Buffer.from(payload).toString("base64");
}

/* ---------------------------------------------
   Decode Cursor
--------------------------------------------- */
function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const [createdAt, id] = decoded.split("|");

    return {
      createdAt: new Date(createdAt),
      id
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------
   Build MongoDB Query
--------------------------------------------- */
function buildMongoQuery(baseFilter = {}, cursorObj) {
  if (!cursorObj) return baseFilter;

  return {
    ...baseFilter,
    $or: [
      // fetch older records
      { createdAt: { $lt: cursorObj.createdAt } },

      // tie-breaker when timestamps are equal
      {
        createdAt: cursorObj.createdAt,
        _id: { $lt: cursorObj.id }
      }
    ]
  };
}

/* ---------------------------------------------
   Paginate Results
--------------------------------------------- */
function paginateResults(rows, limit = DEFAULT_LIMIT) {
  const hasMore = rows.length > limit;

  const items = hasMore
    ? rows.slice(0, limit)
    : rows;

  let nextCursor = null;

  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];

    nextCursor = encodeCursor(
      new Date(last.createdAt),
      last.id || last._id
    );
  }

  return {
    items,
    hasMore,
    nextCursor
  };
}

module.exports = {
  encodeCursor,
  decodeCursor,
  buildMongoQuery,
  paginateResults,
  DEFAULT_LIMIT
};