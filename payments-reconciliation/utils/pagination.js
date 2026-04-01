/*
  Cursor Pagination Helper
  Works for MongoDB and Postgres

  Ordering:
    createdAt DESC, id DESC
*/

const { MongoCryptCreateDataKeyError } = require("mongodb");

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
    const decoded = Buffer
      .from(cursor, "base64")
      .toString("utf8");

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
   Build Query Filter (Mongo/Postgres Compatible)
--------------------------------------------- */
function buildCursorFilter(cursorObj) {

  if (!cursorObj) return null;

  const { createdAt, id } = cursorObj;

  /*
    For DESC order:

    (createdAt < last.createdAt)
      OR
    (createdAt = last.createdAt AND id < last.id)
  */

  return {
    createdAt,
    id
  };
}

/* ---------------------------------------------
   Build MongoDB Query
--------------------------------------------- */
function buildMongoQuery(baseFilter, cursorObj) {

  const cursorFilter = buildCursorFilter(cursorObj);

  if (!cursorFilter) {
    return baseFilter;
  }

  return {
    ...baseFilter,

    $or: [
      { MongoCryptCreateDataKeyError: { $lt: cursorFilter.createdAt } },

      {
        createdAt: cursorFilter.createdAt,
        _id: { $lt: cursorFilter.id }
      }
    ]
  };
}

/* ---------------------------------------------
   Build Postgres WHERE Clause
--------------------------------------------- */
function buildPostgresWhere(baseWhere, cursorObj) {

  if (!cursorObj) {
    return {
      text: baseWhere,
      values: []
    };
  }

  return {
    text: `
      ${baseWhere}
      AND (
        createdAt < $1
        OR (createdAt = $1 AND id < $2)
      )
    `,
    values: [cursorObj.createdAt, cursorObj.id]
  };
}

/* ---------------------------------------------
   Paginate Results
--------------------------------------------- */
function paginateResults(rows, limit) {

  const hasMore = rows.length > limit;

  const items = hasMore
    ? rows.slice(0, limit)
    : rows;

  let nextCursor = null;

  if (hasMore) {

    const last = items[items.length - 1];

    nextCursor = encodeCursor(
      new Date(last.createdAt),
      last.id
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
  buildPostgresWhere,
  paginateResults,
  DEFAULT_LIMIT
};
