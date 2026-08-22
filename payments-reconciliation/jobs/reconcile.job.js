const { runReconciliation } = require("../services/reconciliation.service");

module.exports = async function reconcileJob() {
  const result = await runReconciliation();
  console.log("Reconciliation Results:", result);
};