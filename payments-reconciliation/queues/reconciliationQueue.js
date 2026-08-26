const { Queue } = require("bullmq");
const connection = require("./connection");

/*
  Replaces jobs/scheduler.js's node-cron schedule, which was never
  actually wired into server.js/app.js and therefore never ran in
  practice. BullMQ's repeatable jobs are scheduled here (see
  worker.js, which registers the repeat pattern once at startup)
  and consumed by workers/reconciliation.worker.js — reusing
  jobs/reconcile.job.js and services/reconciliation.service.js
  completely unchanged.
*/
const reconciliationQueue = new Queue("reconciliation", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 }
  }
});

module.exports = reconciliationQueue;
