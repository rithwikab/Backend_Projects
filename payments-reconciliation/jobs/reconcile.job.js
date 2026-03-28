const Expected = require("../models/ExpectedPayment");
const Transaction = require("../models/Transaction");

const {
  reconcilePayments
} = require("../services/reconciliation.logic");

async function runReconciliation() {

  const expected = await Expected.find({
    status: { $in: ["PENDING", "PARTIAL"] }
  });

  const actual = await Transaction.find({
    status: "UNMATCHED"
  });

  const results =
    reconcilePayments(expected, actual);

  console.log("Reconciliation Results:", results);



  // Later: persist results
}

module.exports = runReconciliation;
