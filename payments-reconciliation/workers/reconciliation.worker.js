const { Worker } = require("bullmq");
const connection = require("../queues/connection");
const reconcileJob = require("../jobs/reconcile.job");

/*
  Consumes the repeatable job registered in worker.js. Reuses
  jobs/reconcile.job.js -> services/reconciliation.service.js
  completely unchanged — this worker only decides WHEN
  runReconciliation() runs, never HOW.

  This replaces jobs/scheduler.js's node-cron schedule, which was
  never actually invoked from server.js or app.js in the base
  project (a pre-existing gap noted in the earlier interview
  guide's "Bug #10").
*/
const worker = new Worker(
  "reconciliation",
  async () => {
    return reconcileJob();
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`[reconciliation-worker] scheduled run ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[reconciliation-worker] scheduled run ${job?.id} failed:`, err.message);
  // No terminal DB status to flip here (unlike the other two
  // workers) — a failed reconciliation run just means the next
  // scheduled run (or a manual POST /reconciliation/run) will pick
  // up the same still-PENDING/UNMATCHED records. Nothing was left
  // half-written specific to this run that needs cleanup.
});

module.exports = worker;
