require("dotenv").config();

const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 3000;

/* ---------------- Start Server ---------------- */

async function start() {

  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });

  /*
    RUN_WORKER_IN_PROCESS: lets this single process also run the
    BullMQ workers (transaction/webhook/reconciliation), instead of
    requiring a separate "worker.js" process. This exists purely so
    the whole app can run on Render's free Web Service tier — Render
    has NO free tier for its "Background Worker" service type (min.
    $7/mo as of writing), while Web Services do have a free tier.

    For a real production deployment, worker.js should still run as
    its own separate process/service (as originally designed) so API
    traffic and background job processing don't compete for the same
    event loop and can scale independently — set this env var to
    "true" only where that separation genuinely isn't affordable/
    necessary (a free-tier demo deployment, local single-process dev).
  */
  if (process.env.RUN_WORKER_IN_PROCESS === "true") {
    console.log("RUN_WORKER_IN_PROCESS=true — starting workers in this same process.");

    require("./workers/transaction.worker");
    require("./workers/webhook.worker");
    require("./workers/reconciliation.worker");

    const reconciliationQueue = require("./queues/reconciliationQueue");
    await reconciliationQueue.add(
      "scheduled-run",
      {},
      { repeat: { pattern: "0 */6 * * *" } }
    );
  }
}

start();