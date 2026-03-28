const Expected =
  require("../../models/ExpectedPayment");

const {
  decodeCursor,
  encodeCursor,
  paginateResults,
  DEFAULT_LIMIT
} = require("../../utils/pagination");


/*
  List Expected Payments (Cursor Pagination)
*/
exports.listExpectedPayments = async (req, res, next) => {

  try {

    const limit =
      Number(req.query.limit) || DEFAULT_LIMIT;

    const cursor =
      decodeCursor(req.query.cursor);

    let query = {};

    if (cursor) {

      query.$or = [

        { createdAt: { $lt: cursor.createdAt } },

        {
          createdAt: cursor.createdAt,
          _id: { $lt: cursor.id }
        }
      ];
    }

    const docs = await Expected.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);

    const hasMore = docs.length > limit;

    const items = hasMore
      ? docs.slice(0, limit)
      : docs;

    let nextCursor = null;

    if (hasMore) {

      const last = items[items.length - 1];

      nextCursor = encodeCursor(
        last.createdAt,
        last._id.toString()
      );
    }

    res.json({
      success: true,
      data: {
        items,
        hasMore,
        nextCursor
      }
    });

  } catch (err) {
    next(err);
  }
};
