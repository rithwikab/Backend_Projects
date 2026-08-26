const { Queue } = require("bullmq");
const connection = require("./connection");

/*
  Replaces the old fire-and-forget call to processWebhookEvent in
  modules/webhooks/webhook.controller.js. Only the WebhookEvent's
  _id is enqueued (not the full document) — the worker re-fetches
  it fresh from MongoDB before processing, which is the standard
  pattern for queue payloads (pass references, not full state, so
  the queue isn't a second source of truth for data that already
  lives in the database).
*/
const webhookQueue = new Queue("webhook-processing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 }
  }
});

module.exports = webhookQueue;
