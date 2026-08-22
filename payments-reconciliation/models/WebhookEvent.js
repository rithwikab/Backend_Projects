const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema({

  provider: {
    type: String,
    required: true,
    default: "generic"
  },

  event_id: {
    type: String,
    required: true
  },

  event_type: {
    type: String,
    required: true
  },

  payload: {
    type: Object,
    required: true
  },

  // Hash of the raw bytes the provider sent. Not the idempotency
  // key itself (event_id is) — kept so a repeat delivery with the
  // SAME event_id but DIFFERENT content can be detected/audited
  // later if it ever happens.
  payload_hash: String,

  status: {
    type: String,
    enum: ["RECEIVED", "PROCESSED", "FAILED"],
    default: "RECEIVED"
  },

  transaction_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction"
  },

  error_message: String

}, { timestamps: true });

/* ===============================
   INDEXES

   The real idempotency guard: a given provider can never have the
   same event_id processed twice, DB-enforced, same pattern as
   Transaction.payload_hash and UploadBatch.batch_hash.
================================ */
webhookEventSchema.index(
  { provider: 1, event_id: 1 },
  { unique: true }
);

webhookEventSchema.index({ createdAt: -1 });
webhookEventSchema.index({ status: 1 });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
