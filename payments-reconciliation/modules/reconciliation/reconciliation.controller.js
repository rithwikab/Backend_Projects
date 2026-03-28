const {
  runReconciliation,
  getReconciliationSummary
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
