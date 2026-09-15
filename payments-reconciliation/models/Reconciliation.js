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

  /*
    NEW: distinguishes high-confidence, reference-based matches
    (auto-applied immediately, as before) from low-confidence,
    amount-only matches (held for human review before they can
    change any ExpectedPayment/Transaction status). See
    services/reconciliation.logic.js's requiresReview flag and
    services/reconciliation.service.js's runReconciliation.

    AUTO_CONFIRMED — Rule 1/2 result, committed immediately (old
                     behavior, unchanged for these).
    PENDING_REVIEW — Rule 3/4 result, NOT yet committed.
    CONFIRMED      — was PENDING_REVIEW, a human approved it.
    REJECTED       — was PENDING_REVIEW, a human rejected it; the
                     underlying ExpectedPayment/Transaction were
                     never touched and remain exactly as they were.
  */
  review_status: {
    type: String,
    enum: ["AUTO_CONFIRMED", "PENDING_REVIEW", "CONFIRMED", "REJECTED"],
    default: "AUTO_CONFIRMED"
  },

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
reconciliationSchema.index({ review_status: 1 });
reconciliationSchema.index({ createdAt: -1 });
module.exports = mongoose.model("Reconciliation", reconciliationSchema);