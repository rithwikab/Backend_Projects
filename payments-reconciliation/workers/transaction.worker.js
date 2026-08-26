const { Worker } = require("bullmq");
const connection = require("../queues/connection");
const { processTransactionUpload } = require("../jobs/transaction.job");
const UploadBatch = require("../models/UploadBatch");
const AuditLog = require("../models/AuditLog");

/*
  Consumes jobs added by modules/transactions/transaction.controller.js
  to the "transaction-processing" queue. Runs as part of the
  separate worker.js process — NOT inside the same process handling
  HTTP requests (see docker-compose.yml's new "worker" service).
*/
const worker = new Worker(
  "transaction-processing",
  async (job) => {
    return processTransactionUpload(job.data);
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => {
  console.log(`[transaction-worker] job ${job.id} completed (batch ${job.data.batchId})`);
});

/*
  Fires on EVERY failed attempt, not just the last one — job.attemptsMade
  tells us whether BullMQ has exhausted its retries (per
  queues/transactionQueue.js's defaultJobOptions.attempts) or is
  about to retry automatically. Only mark the UploadBatch as
  terminally FAILED once retries are exhausted — an early attempt
  failing due to a transient DB blip shouldn't show up to the user
  as a failed upload if the next retry succeeds.
*/
worker.on("failed", async (job, err) => {
  console.error(
    `[transaction-worker] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`,
    err.message
  );

  if (!job) return;

  const exhausted = job.attemptsMade >= job.opts.attempts;
  if (!exhausted) return;

  const { batchId, totalRecords, user_id } = job.data;

  await UploadBatch.findByIdAndUpdate(batchId, {
    imported: 0,
    rejected: totalRecords,
    status: "FAILED"
  });

  await AuditLog.create({
    user_id: user_id || null,
    action: "UPLOAD_FAILED",
    meta: { error: err.message, batch_id: batchId, attempts: job.attemptsMade }
  });
});

module.exports = worker;
