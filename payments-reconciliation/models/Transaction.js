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
    enum: ["UNMATCHED", "MATCHED"],
    default: "UNMATCHED"
  },

  raw_payload: Object,

payload_hash: {
  type: String,
  unique: true
},
upload_batch_id: { type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch" }

}, { timestamps: true });

/* ===============================
   INDEXES 
================================ */

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index(
  { payload_hash: 1 },
  { unique: true }
);
module.exports = mongoose.model("Transaction", transactionSchema);