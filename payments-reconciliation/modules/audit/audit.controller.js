const AuditLog =
  require("../../models/AuditLog");

const {
  decodeCursor,
  encodeCursor,
  DEFAULT_LIMIT
} = require("../../utils/pagination");

exports.getAuditLogs = async (req, res, next) => {

  try {

    const limit =
      parseInt(req.query.limit) ||
      DEFAULT_LIMIT;

    const cursor =
      decodeCursor(req.query.cursor);

    let query = {};

    if (cursor) {
      query = {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            _id: { $lt: cursor.id }
          }
        ]
      };
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate("user_id", "email role");

    const hasMore =
      logs.length > limit;

    const items =
      hasMore ? logs.slice(0, limit) : logs;

    let nextCursor = null;

    if (hasMore) {
      const last =
        items[items.length - 1];

      nextCursor = encodeCursor(
        last.createdAt,
        last._id.toString()
      );
    }

    res.json({
      success: true,
      data: {
        items,
        nextCursor,
        hasMore
      }
    });

  } catch (err) {
    next(err);
  }
};
