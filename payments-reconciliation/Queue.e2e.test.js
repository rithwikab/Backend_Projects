/**
 * End-to-end test for the Redis + BullMQ background processing layer
 * (queues/*.js, workers/*.js, worker.js).
 *
 * Same conventions as this repo's other e2e tests: plain Node, global
 * fetch, no npm dependencies, admin login, PASS/FAIL console output.
 *
 * This file does NOT replace Reconciliation.e2e.test.js or
 * Webhook.e2e.test.js — it specifically targets what changed when the
 * old fire-and-forget calls became BullMQ queue.add() calls:
 *
 *   1. Transaction upload is still accepted (202) and still ends up
 *      processed — now via queue + worker, not an inline async call.
 *   2. A job that throws is retried (not immediately marked failed).
 *   3. A job that keeps throwing on every attempt eventually gets
 *      marked FAILED only after retries are exhausted, with an
 *      accurate rejected/error record — proving retry policy now
 *      lives in the worker (workers/*.js's 'failed' handler), not in
 *      jobs/transaction.job.js / jobs/webhook.job.js themselves.
 *   4. A REAL, documented edge case: a transaction batch that
 *      contains one duplicate record among otherwise-new records
 *      causes insertMany({ordered:false}) to still REJECT (because
 *      at least one write errored), even though the non-duplicate
 *      records were already persisted before the rejection. That
 *      means a batch can end up marked FAILED in UploadBatch while
 *      some of its records genuinely did make it into the database.
 *      This test asserts that this is exactly what happens — it is
 *      not fixed here, only proven and documented, since fixing it
 *      is a repository-layer change outside "add a queue" scope.
 *   5. Existing reconciliation (untouched by this feature) still
 *      works end-to-end on a queue-processed transaction.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000/api/v1 \
 *   ADMIN_EMAIL=admin@test.com \
 *   ADMIN_PASSWORD=admin123 \
 *   node Queue.e2e.test.js
 *
 * REQUIRES the worker process to be running (`npm run worker`, or the
 * "worker" service in docker-compose) — nothing in this test will
 * pass if only the API server is up, since processing now happens
 * exclusively in the worker process. This is itself worth noticing:
 * with the old fire-and-forget design, running just the API was
 * enough for uploads to eventually process; that is no longer true.
 *
 * Timing note: this test waits for real exponential backoff between
 * retry attempts (queues/*.js: attempts:3, backoff: exponential,
 * delay:5000 -> attempt gaps of ~5s then ~10s). The failure-path
 * checks below therefore sleep up to ~25s — this is inherent to
 * testing real retry timing, not a flaw in the test.
 */

const crypto = require("crypto");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "dev_webhook_secret_change_me";

const ts = Date.now();
const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function sign(rawBody, secret = WEBHOOK_SECRET) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

async function postWebhook(rawBody, signature) {
  const res = await fetch(`${BASE_URL}/webhooks/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature !== undefined ? { "x-webhook-signature": signature } : {})
    },
    body: rawBody
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

/* Waits until `check()` returns a truthy result, or gives up after timeoutMs. */
async function waitUntil(check, timeoutMs, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await sleep(intervalMs);
  }
  return last;
}

async function run() {

  /* ---------- Login ---------- */
  const login = await api("POST", "/auth/login", null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const token =
    login.data?.data?.access_token ||
    login.data?.data?.token ||
    login.data?.token;
  record("Admin login", login.status === 200 && !!token, `status=${login.status}`);
  if (!token) {
    console.log("Cannot continue without an admin token — aborting.");
    return summarize();
  }

  /* =========================================================
     1. HAPPY PATH: upload is accepted, and eventually processed
        by the worker (not the API process itself).
  ========================================================= */
  const refHappy = `QREF-${ts}-HAPPY`;
  const uploadHappy = await api("POST", "/ingestion/transactions/upload", token, {
    records: [{
      reference_no: refHappy,
      customer_ref: `CUST-${ts}`,
      amount: 750,
      currency: "INR",
      transaction_date: new Date().toISOString()
    }]
  });
  record("1a. Upload accepted (202)", uploadHappy.status === 202, `status=${uploadHappy.status}`);

  const happyResult = await waitUntil(async () => {
    const list = await api("GET", "/ingestion/transactions?limit=50", token);
    return (list.data?.items || []).find(t => t.reference_no === refHappy);
  }, 15000);
  record(
    "1b. Transaction processed by worker (found in DB)",
    !!happyResult && happyResult.status === "UNMATCHED",
    happyResult ? `status=${happyResult.status}` : "not found within timeout"
  );

  /* =========================================================
     2 & 3. RETRY THEN TERMINAL FAILURE (webhook path)
     A structurally valid but semantically invalid payment.success
     event (missing amount) fails identically on every attempt —
     a clean, deterministic way to reach exhausted-retries.
  ========================================================= */
  const badEvent = {
    id: `evt_${ts}_permfail`,
    type: "payment.success",
    data: { reference_no: `QREF-${ts}-BAD`, currency: "INR" } // amount missing — always throws
  };
  const rawBad = Buffer.from(JSON.stringify(badEvent));
  const resBad = await postWebhook(rawBad, sign(rawBad));
  record("2a. Semantically-bad event still accepted at HTTP layer (202)", resBad.status === 202, `status=${resBad.status}`);

  /* Immediately after acceptance, before retries have exhausted,
     the event should NOT yet be FAILED — it should still be
     RECEIVED (queued/being retried). This is the actual proof that
     retry policy moved to the worker: the old version would have
     marked this FAILED on the very first attempt, near-instantly. */
  await sleep(1000);
  const midFlight = await api("GET", `/webhooks/events?status=RECEIVED&limit=50`, token);
  const stillInFlight = (midFlight.data?.items || []).find(e => e.event_id === badEvent.id);
  record(
    "2b. Job is NOT immediately marked FAILED (evidence retries are happening)",
    !!stillInFlight,
    stillInFlight ? "still RECEIVED shortly after acceptance, as expected" : "already resolved — check timing/backoff config"
  );

  const failedResult = await waitUntil(async () => {
    const list = await api("GET", "/webhooks/events?status=FAILED&limit=50", token);
    return (list.data?.items || []).find(e => e.event_id === badEvent.id);
  }, 30000, 3000);
  record(
    "3. Terminal FAILED status reached only after retries exhausted",
    !!failedResult && !!failedResult.error_message,
    failedResult ? failedResult.error_message : "never reached FAILED within timeout"
  );

  /* =========================================================
     4. DOCUMENTED EDGE CASE: partial-duplicate batch
     Upload record X, then a second batch containing X again
     (duplicate payload_hash) PLUS a new record Y. insertMany
     with {ordered:false} still REJECTS the whole call because X
     errors — even though Y gets persisted before that rejection.
     Expect: batch ends up FAILED, but Y is still findable.
  ========================================================= */
  const refX = `QREF-${ts}-X`;
  const refY = `QREF-${ts}-Y`;

  const uploadX = await api("POST", "/ingestion/transactions/upload", token, {
    records: [{
      reference_no: refX,
      customer_ref: `CUST-${ts}`,
      amount: 111,
      currency: "INR",
      transaction_date: "2026-01-01T00:00:00.000Z" // fixed date so payload_hash is reproducible
    }]
  });
  record("4a. First batch (record X) accepted", uploadX.status === 202, `status=${uploadX.status}`);

  await waitUntil(async () => {
    const list = await api("GET", "/ingestion/transactions?limit=50", token);
    return (list.data?.items || []).find(t => t.reference_no === refX);
  }, 15000);

  const uploadXY = await api("POST", "/ingestion/transactions/upload", token, {
    records: [
      {
        reference_no: refX, // duplicate of the record above — same payload_hash
        customer_ref: `CUST-${ts}`,
        amount: 111,
        currency: "INR",
        transaction_date: "2026-01-01T00:00:00.000Z"
      },
      {
        reference_no: refY, // new, non-duplicate record in the SAME batch
        customer_ref: `CUST-${ts}`,
        amount: 222,
        currency: "INR",
        transaction_date: new Date().toISOString()
      }
    ]
  });
  record("4b. Second batch (X duplicate + new Y) accepted at HTTP layer", uploadXY.status === 202, `status=${uploadXY.status}`);

  const yResult = await waitUntil(async () => {
    const list = await api("GET", "/ingestion/transactions?limit=100", token);
    return (list.data?.items || []).find(t => t.reference_no === refY);
  }, 15000);
  record(
    "4c. Y was persisted despite the batch ultimately failing",
    !!yResult,
    yResult ? "Y found in DB" : "Y not found — behavior may differ from what's documented"
  );

  const batchFailed = await waitUntil(async () => {
    const uploads = await api("GET", "/uploads/my?limit=50", token);
    // Note: /uploads/my wraps its payload as {success, data:{items,...}},
    // while /ingestion/transactions returns {items,...} directly — a
    // real, pre-existing response-shape inconsistency between these
    // two endpoints, unrelated to the queue feature. Handled here
    // correctly, not a bug in this test.
    // workers/transaction.worker.js's 'failed' handler sets
    // rejected = totalRecords (the ORIGINAL upload count, 2 here —
    // both X and Y individually passed controller validation; the
    // failure is a DB-level duplicate, not a validation rejection).
    return (uploads.data?.data?.items || []).find(
      u => u.status === "FAILED" && u.total_records === 2 && u.rejected === 2 && u.imported === 0
    );
  }, 30000, 3000);
  record(
    "4d. Batch containing the duplicate ends up FAILED overall (documented, not fixed)",
    !!batchFailed,
    batchFailed ? "confirmed: ordered:false still rejects the whole insertMany on any duplicate" : "batch did not reach FAILED — re-check bulkInsert behavior, this may have changed"
  );

  /* =========================================================
     5. EXISTING RECONCILIATION STILL WORKS UNTOUCHED
     (regression check — reconciliation.logic.js was never
     touched by this feature)
  ========================================================= */
  const expUpload = await api("POST", "/ingestion/expected-payments/upload", token, {
    records: [{
      source_ref: refHappy,
      customer_id: `CUST-${ts}`,
      amount: 750,
      currency: "INR",
      due_date: new Date().toISOString().slice(0, 10)
    }]
  });
  record("5a. Matching invoice uploaded", expUpload.status === 201, `status=${expUpload.status}`);

  const reconRun = await api("POST", "/reconciliation/run", token);
  record("5b. Manual reconciliation trigger still works (unaffected by queue change)", reconRun.status === 200, `status=${reconRun.status}`);

  const expList = await api("GET", "/ingestion/expected-payments?limit=50", token);
  const matched = (expList.data?.items || []).find(e => e.source_ref === refHappy);
  record(
    "5c. Queue-processed transaction correctly reconciled by unchanged matching logic",
    !!matched && matched.status === "PAID",
    matched ? `status=${matched.status}` : "invoice not found"
  );

  summarize();
}

function summarize() {
  const pass = results.filter(r => r.pass).length;
  console.log("\n=== QUEUE (REDIS + BULLMQ) E2E RESULTS ===");
  console.log(`${pass}/${results.length} passed`);
  results.filter(r => !r.pass).forEach(r => console.log(`  FAILED: ${r.name} ${r.detail}`));
}

run().catch(err => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
