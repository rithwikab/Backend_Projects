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

module.exports = mongoose.model("Reconciliation", reconciliationSchema);
