const crypto = require("crypto");

const WebhookEvent = require("../models/WebhookEvent");
const TransactionRepo = require("../repositories/transaction.repo");
const AuditLog = require("../models/AuditLog");

/*
  Worker-equivalent for this codebase's existing fire-and-forget
  job pattern (see jobs/transaction.job.js — same shape: an async
  function called without awaiting, with its own try/catch as the
  only safety net). No external queue library exists in this
  project, so this function IS "the worker", same as
  processTransactionUpload already is for CSV/JSON uploads.
*/
exports.processWebhookEvent = async (webhookEvent) => {
  try {

    if (webhookEvent.event_type === "payment.success") {
      await handlePaymentSuccess(webhookEvent);
    } else if (webhookEvent.event_type === "payment.failed") {
      await handlePaymentFailed(webhookEvent);
    }
    // Unsupported types never reach here — filtered out in the
    // controller before a WebhookEvent row is even created.

    await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
      status: "PROCESSED"
    });

  } catch (err) {
    console.error("Webhook job failed:", err.message);

    await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
      status: "FAILED",
      error_message: err.message
    });

    await AuditLog.create({
      user_id: null,
      action: "WEBHOOK_PROCESSING_FAILED",
      meta: { event_id: webhookEvent.event_id, error: err.message }
    });
    // No automatic retry: this codebase has no retry mechanism for
    // ANY of its existing background jobs either (see
    // jobs/transaction.job.js). What's genuinely different here is
    // that the failure is durable and addressable — a FAILED
    // WebhookEvent row is a re-runnable unit (re-invoke
    // processWebhookEvent(webhookEvent) with the same doc), unlike
    // a failed transaction upload job, which has no persisted
    // retry point at all. True automatic retry (backoff, max
    // attempts) is explicitly NOT implemented — see
    // WEBHOOK_INTERVIEW_NOTES.md, section 8.
  }
};

/* ===============================
   payment.success

   Reuses the EXISTING transaction ingestion path — the same
   repository function, the same payload_hash idempotency formula
   used in jobs/transaction.job.js, the same starting UNMATCHED
   status — so a webhook-sourced payment is indistinguishable from
   a manually-uploaded one by the time it reaches reconciliation.
   reconciliation.logic.js required ZERO changes for this feature.
================================ */
async function handlePaymentSuccess(webhookEvent) {
  const { data } = webhookEvent.payload;

  const reference_no = data.reference_no || data.reference || data.order_id;
  const amount = Number(data.amount);
  const currency = data.currency;
  const transaction_date = data.transaction_date || data.paid_at || new Date().toISOString();
  const customer_ref = data.customer_ref || data.customer_id;

  if (!reference_no || !amount || !currency || isNaN(amount)) {
    throw new Error("payment.success event missing/invalid reference_no, amount, or currency");
  }

  const payload_hash = crypto
    .createHash("sha256")
    .update(`${reference_no}-${amount}-${transaction_date}`)
    .digest("hex");

  const record = {
    provider: webhookEvent.provider,
    reference_no,
    customer_ref,
    amount,
    currency,
    transaction_date: new Date(transaction_date),
    raw_payload: webhookEvent.payload,
    payload_hash
  };

  let inserted;
  try {
    inserted = await TransactionRepo.bulkInsert([record], null);
  } catch (err) {
    const isDuplicateKey =
      err.code === 11000 ||
      (Array.isArray(err.writeErrors) && err.writeErrors.every(e => e.code === 11000));

    if (isDuplicateKey) {
      // Not a failure — the same underlying payment already exists
      // as a Transaction (e.g. it was also uploaded manually, or a
      // different webhook event happened to describe the same
      // reference/amount/date). This IS the existing record-level
      // idempotency guarantee doing its job via a second path.
      await AuditLog.create({
        user_id: null,
        action: "WEBHOOK_PAYMENT_DUPLICATE_TRANSACTION",
        meta: { event_id: webhookEvent.event_id, reference_no }
      });
      return;
    }
    throw err;
  }

  const transaction = inserted[0];

  await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
    transaction_id: transaction._id
  });

  await AuditLog.create({
    user_id: null,
    action: "WEBHOOK_PAYMENT_SUCCESS",
    meta: {
      event_id: webhookEvent.event_id,
      transaction_id: transaction._id,
      reference_no
    }
  });

  // Reconciliation is deliberately NOT triggered synchronously
  // here. The new Transaction sits UNMATCHED exactly like any
  // manually-uploaded one, and is picked up by the existing manual
  // POST /reconciliation/run trigger or the existing 6-hourly
  // scheduler — same as every other ingestion path in this
  // codebase. See WEBHOOK_INTERVIEW_NOTES.md, section 6, for why.
}

/* ===============================
   payment.failed

   No money moved — nothing to reconcile. Recorded for audit
   visibility only. Deliberately minimal: see
   WEBHOOK_INTERVIEW_NOTES.md's "Pre-existing issues discovered" /
   limitations section for what this does NOT do (e.g. reverse a
   prior match, or track failed-attempt history as its own
   queryable entity).
================================ */
async function handlePaymentFailed(webhookEvent) {
  await AuditLog.create({
    user_id: null,
    action: "WEBHOOK_PAYMENT_FAILED",
    meta: {
      event_id: webhookEvent.event_id,
      data: webhookEvent.payload.data
    }
  });
}
