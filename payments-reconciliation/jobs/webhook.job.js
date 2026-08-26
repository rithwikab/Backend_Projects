const crypto = require("crypto");

const WebhookEvent = require("../models/WebhookEvent");
const TransactionRepo = require("../repositories/transaction.repo");
const AuditLog = require("../models/AuditLog");

/*
  NOTE: this function no longer has its own outer try/catch (see
  WEBHOOK_INTERVIEW_NOTES.md for the prior fire-and-forget version,
  which caught everything here and immediately marked the
  WebhookEvent as FAILED on the very first error).

  Now that this is invoked by workers/webhook.worker.js as a BullMQ
  job processor, retry policy belongs at the queue layer: if this
  throws, BullMQ retries per queues/webhookQueue.js's configured
  attempts/backoff, and only the worker's 'failed' event (after all
  attempts are exhausted) marks the WebhookEvent as FAILED. This
  function's only job now is: succeed, or throw.

  The INNER try/catch inside handlePaymentSuccess() below is
  different and intentionally stays — that one distinguishes "this
  is actually a duplicate, not a failure" from a real error, which
  has nothing to do with retry policy.
*/
exports.processWebhookEvent = async (webhookEvent) => {

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
