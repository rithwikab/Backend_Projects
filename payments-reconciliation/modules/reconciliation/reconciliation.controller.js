const {
  runReconciliation,
  getReconciliationSummary,
  listPendingReview,
  confirmSuggestedMatch,
  rejectSuggestedMatch
} = require("../../services/reconciliation.service");


/* Run reconciliation */
exports.triggerReconciliation = async (req, res, next) => {

  try {

    const result = await runReconciliation();

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    next(err);
  }
};


/* Get dashboard summary */
exports.getSummary = async (req, res, next) => {

  try {

    const summary =
      await getReconciliationSummary();

    res.json({
      success: true,
      data: summary
    });

  } catch (err) {
    next(err);
  }
};


/* ===============================
   SUGGESTED MATCH REVIEW (NEW)
================================ */

/* List low-confidence matches awaiting human confirmation */
exports.listPendingReview = async (req, res, next) => {

  try {

    const { cursor, limit } = req.query;

    const result = await listPendingReview({ cursor, limit });

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    next(err);
  }
};

/* Approve a suggested match — commits the invoice/transaction status change, then re-runs reconciliation */
exports.confirmMatch = async (req, res, next) => {

  try {

    const result = await confirmSuggestedMatch(req.params.id, req.user?.id);

    res.json({
      success: true,
      data: result // { reconciliation, rerun }
    });

  } catch (err) {

    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message
      });
    }

    next(err);
  }
};

/* Reject a suggested match — invoice/transaction remain untouched, then re-runs reconciliation */
exports.rejectMatch = async (req, res, next) => {

  try {

    const result = await rejectSuggestedMatch(
      req.params.id,
      req.user?.id,
      req.body?.remarks
    );

    res.json({
      success: true,
      data: result // { reconciliation, rerun }
    });

  } catch (err) {

    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message
      });
    }

    next(err);
  }
};