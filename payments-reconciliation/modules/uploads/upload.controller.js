const UploadBatch =
  require("../../models/UploadBatch");


exports.getMyUploads = async (req, res) => {

  const limit =
    parseInt(req.query.limit) || 5;

  const cursor = req.query.cursor;

  const query = {
    user_id: req.user.id
  };

  if (cursor) {
    query._id = { $lt: cursor };
  }

  const batches = await UploadBatch
    .find(query)
    .sort({ _id: -1 })
    .limit(limit + 1);

  let nextCursor = null;

  if (batches.length > limit) {
    nextCursor =
      batches[limit]._id;

    batches.pop();
  }

  res.json({
    success: true,
    data: {
      items: batches,
      nextCursor
    }
  });
};
