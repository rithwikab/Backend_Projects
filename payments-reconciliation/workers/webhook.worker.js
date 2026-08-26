const { Worker } = require("bullmq");
const connection = require("../queues/connection");
const { processWebhookEvent } = require("../jobs/webhook.job");
const WebhookEvent = require("../models/WebhookEvent");
const AuditLog = require("../models/AuditLog");

/*
  Consumes jobs added by modules/webhooks/webhook.controller.js to
  the "webhook-processing" queue. Only a WebhookEvent _id travels
  through the queue (see queues/webhookQueue.js) — the worker
  re-fetches the full document here before processing it.
*/
const worker = new Worker(
  "webhook-processing",
  async (job) => {
    const event = await WebhookEvent.findById(job.data.webhookEventId);

    if (!event) {
      // Extremely unlikely — would mean the WebhookEvent row was
      // deleted between being enqueued and the worker picking it
      // up. Nothing to process; not treated as a failure.
      console.warn(`[webhook-worker] WebhookEvent ${job.data.webhookEventId} not found, skipping`);
      return;
    }

    return processWebhookEvent(event);
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => {
  console.log(`[webhook-worker] job ${job.id} completed (event ${job.data.webhookEventId})`);
});

worker.on("failed", async (job, err) => {
  console.error(
    `[webhook-worker] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`,
    err.message
  );

  if (!job) return;

  const exhausted = job.attemptsMade >= job.opts.attempts;
  if (!exhausted) return;

  const { webhookEventId } = job.data;

  await WebhookEvent.findByIdAndUpdate(webhookEventId, {
    status: "FAILED",
    error_message: err.message
  });

  await AuditLog.create({
    user_id: null,
    action: "WEBHOOK_PROCESSING_FAILED",
    meta: { webhook_event_id: webhookEventId, error: err.message, attempts: job.attemptsMade }
  });
});

module.exports = worker;
