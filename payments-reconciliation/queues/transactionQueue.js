const { Queue } = require("bullmq");
const connection = require("./connection");

/*
  Replaces the old fire-and-forget call to processTransactionUpload
  in modules/transactions/transaction.controller.js. The controller
  now enqueues a job and returns immediately (still 202 Accepted) —
  the difference is the job is now DURABLE (stored in Redis before
  the HTTP response is sent), retried automatically on failure, and
  processed by a separate worker process (workers/transaction.worker.js),
  not by the same process that's serving HTTP traffic.
*/
const transactionQueue = new Queue("transaction-processing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    // Keep a short history for debugging without letting Redis grow
    // unbounded — production would likely tune these further.
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 }
  }
});

module.exports = transactionQueue;
