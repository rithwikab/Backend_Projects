const crypto = require("crypto");

const WebhookEvent = require("../../models/WebhookEvent");
const webhookQueue = require("../../queues/webhookQueue");

const {
  decodeCursor,
  buildMongoQuery,
  paginateResults,
  DEFAULT_LIMIT
} = require("../../utils/pagination");

const SUPPORTED_EVENT_TYPES = ["payment.success", "payment.failed"];

/*
  Handle Payment Webhook

  Signature already verified by webhookSignature.middleware.js by
  the time this runs (req.rawBody is set). This function only:
  parse -> validate -> idempotency-check -> persist -> hand off to
  the async job -> respond.
*/
exports.handlePaymentWebhook = async (req, res, next) => {
  try {

    /* ===============================
       STEP 1: PARSE
    ================================ */
    let event;
    try {
      event = JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({
        success: false,
        error: "Malformed JSON payload"
      });
    }

    /* ===============================
       STEP 2: VALIDATE REQUIRED FIELDS
    ================================ */
    const event_id = event && event.id;
    const event_type = event && event.type;
    const data = event && event.data;

    if (!event_id || typeof event_id !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid event id ('id')"
      });
    }

    if (!event_type || typeof event_type !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid event type ('type')"
      });
    }

    if (!data || typeof data !== "object") {
      return res.status(400).json({
        success: false,
        error: "Missing event data ('data')"
      });
    }

    /* ===============================
       STEP 3: UNSUPPORTED EVENT TYPES

       Acknowledged with 200 rather than rejected. Providers add
       new event types over time; a webhook consumer that hard-
       fails on an event type it just doesn't act on yet would
       cause the provider to retry indefinitely for no benefit.
       Deliberately NOT persisted to WebhookEvent — there is
       nothing to deduplicate or process for a type we ignore.
    ================================ */
    if (!SUPPORTED_EVENT_TYPES.includes(event_type)) {
      return res.status(200).json({
        success: true,
        status: "ignored",
        reason: "unsupported_event_type",
        event_type
      });
    }

    /* ===============================
       STEP 4: IDEMPOTENCY — PERSIST BEFORE PROCESSING

       provider + event_id is the uniqueness key (unique index on
       WebhookEvent, same style as Transaction.payload_hash /
       UploadBatch.batch_hash). A duplicate delivery hits that
       index and is acknowledged WITHOUT being reprocessed.
    ================================ */
    const provider = (event.provider && String(event.provider)) || "generic";
    const payload_hash = crypto
      .createHash("sha256")
      .update(req.rawBody)
      .digest("hex");

    let webhookEvent;
    try {
      webhookEvent = await WebhookEvent.create({
        provider,
        event_id,
        event_type,
        payload: event,
        payload_hash,
        status: "RECEIVED"
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(200).json({
          success: true,
          status: "duplicate",
          message: "Event already received"
        });
      }
      throw err;
    }

    /* ===============================
       STEP 5: QUEUE ASYNC PROCESSING

       Only the WebhookEvent's _id is enqueued, not the full
       document — the worker re-fetches it fresh from MongoDB (see
       workers/webhook.worker.js). Awaiting queue.add() here means
       the job is durably persisted in Redis BEFORE this function
       returns 202 — if this process crashed the instant after,
       the job survives and the separate worker process still
       picks it up. That's the actual gap this replaces (see
       WEBHOOK_INTERVIEW_NOTES.md, Section 8, scenario F, for what
       the fire-and-forget version could NOT guarantee).
    ================================ */
    await webhookQueue.add("process-event", {
      webhookEventId: webhookEvent._id.toString()
    });

    return res.status(202).json({
      success: true,
      status: "accepted",
      event_id
    });

  } catch (err) {
    next(err);
  }
};

/*
  List Webhook Events (observability)

  Same cursor-pagination convention as expected.list.controller.js
  / audit.controller.js / transaction.repo.js's getPaginatedTransactions.
  Gated the same way as /audit, since this is effectively another
  audit surface for a different kind of event.
*/
exports.listWebhookEvents = async (req, res, next) => {
  try {

    const { cursor, limit, status, event_type } = req.query;

    const parsedCursor = decodeCursor(cursor);

    const baseFilter = {};
    if (status) baseFilter.status = status;
    if (event_type) baseFilter.event_type = event_type;

    const query = buildMongoQuery(baseFilter, parsedCursor);

    const finalLimit = Math.min(parseInt(limit) || DEFAULT_LIMIT, 100);

    const rows = await WebhookEvent
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(finalLimit + 1);

    return res.json(paginateResults(rows, finalLimit));

  } catch (err) {
    next(err);
  }
};
