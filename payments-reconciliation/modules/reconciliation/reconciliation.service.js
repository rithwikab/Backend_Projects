const {
  getReconciliationSummary
} = require("../../services/reconciliationSummary.cache");

const ReconciliationRepo = require("../../repositories/reconciliation.repo");

/*
  Fetch reconciliation summary (cached)
*/
exports.fetchSummary = async (params) => {

  return await getReconciliationSummary(
    ReconciliationRepo.fetchSummaryFromDb,
    params,
    { ttl: 90 }
  );
};
