require("dotenv").config();

const { connectDB } = require("./config/db");
const reconciliationQueue = require("./queues/reconciliationQueue");

/*
  This is the SECOND process for this project, alongside server.js.
  server.js serves HTTP requests. This file starts the three
  BullMQ workers that actually do the background work those HTTP
  requests enqueue — see docker-compose.yml's new "worker" service.

  Requiring these files is enough to start each Worker (BullMQ
  Workers begin listening for jobs as soon as they're constructed).
*/
require("./workers/transaction.worker");
require("./workers/webhook.worker");
require("./workers/reconciliation.worker");

const start = async () => {
  await connectDB();

  /*
    Registers the 6-hourly reconciliation schedule. Calling this on
    every worker.js startup is safe, not duplicating — BullMQ keys
    a repeatable job by its name + repeat options, so re-adding the
    same schedule on every restart doesn't create a second one.
  */
  await reconciliationQueue.add(
    "scheduled-run",
    {},
    { repeat: { pattern: "0 */6 * * *" } }
  );

  console.log("Worker process started — listening for transaction, webhook, and reconciliation jobs.");
};

start().catch((err) => {
  console.error("Worker process failed to start:", err);
  process.exit(1);
});
