// This model is reserved for future reconciliation persistence.
// It will store mappings between expected payments and transactions,
// supporting partial matches, variance tracking, and auditability.
// Currently not used in the simplified implementation.
const mongoose = require("mongoose");

const reconciliationSchema = new mongoose.Schema({

  expected_payment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ExpectedPayment"
  },

  actual_transaction_ids: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction"
  }
],


  status: String,

  variance_amount: Number,

  method: String,

  matched_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  remarks: String

}, { timestamps: true });
reconciliationSchema.index({ expected_payment_id: 1 });
reconciliationSchema.index({ status: 1 });
reconciliationSchema.index({ createdAt: -1 });
module.exports = mongoose.model("Reconciliation", reconciliationSchema);
