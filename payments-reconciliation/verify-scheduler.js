/**
 * Diagnostic script — NOT a pass/fail test like the e2e files.
 *
 * There's no HTTP endpoint that exposes BullMQ's internal repeatable
 * job schedule (verify.js in worker.js registers it, but nothing
 * reads it back for a client to see) — so this connects to Redis
 * directly, the same way worker.js does, and prints what's actually
 * scheduled. Useful for confirming the 6-hourly reconciliation
 * schedule (which replaces jobs/scheduler.js's node-cron, never
 * wired into startup in the base project) is really registered,
 * without waiting 6 hours to find out.
 *
 * Usage:
 *   REDIS_URL=redis://localhost:6379 node verify-scheduler.js
 *
 * Requires worker.js to have been started at least once (that's
 * where the repeatable job is added) — run this AFTER starting the
 * worker process, not instead of it.
 */

require("dotenv").config();
const reconciliationQueue = require("./queues/reconciliationQueue");

async function main() {
  const repeatables = await reconciliationQueue.getRepeatableJobs();

  if (repeatables.length === 0) {
    console.log("No repeatable jobs found. Has worker.js been started at least once?");
    process.exit(1);
  }

  console.log(`Found ${repeatables.length} repeatable job(s) on the "reconciliation" queue:\n`);
  for (const job of repeatables) {
    console.log(`  name: ${job.name}`);
    console.log(`  cron pattern: ${job.pattern}`);
    console.log(`  next run at: ${new Date(job.next).toISOString()}`);
    console.log(`  id: ${job.id}\n`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Failed to check scheduled jobs:", err);
  process.exit(1);
});
