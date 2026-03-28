const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({

  provider: String,

  reference_no: {
    type: String,
    required: true
  },

  customer_ref: String,

  amount: Number,

  currency: String,

  transaction_date: Date,

  status: {
    type: String,
    default: "UNMATCHED"
  },

  raw_payload: Object,

  payload_hash: String

}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
