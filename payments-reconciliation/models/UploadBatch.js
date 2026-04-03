const mongoose = require("mongoose");

const uploadBatchSchema = new mongoose.Schema({

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  type: {
    type: String,
    enum: ["expected", "transaction"],
    required: true
  },

  total_records: {
    type: Number,
    required: true
  },

  imported: {
    type: Number,
    required: true
  },

  rejected: {
    type: Number,
    required: true
  },

  status: {
  type: String,
  enum: [
    "PENDING",
    "PROCESSED",   // ✅ ADD
    "FAILED",      // ✅ ADD
    "RECONCILED",
    "PARTIAL"
  ],
  default: "PENDING"
},

  reconciliation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reconciliation"
  }

}, { timestamps: true });

module.exports = mongoose.model(
  "UploadBatch",
  uploadBatchSchema
);
