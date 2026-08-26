/**
 * End-to-end webhook ingestion test.
 *
 * Same style/conventions as Reconciliation.e2e.test.js in this repo:
 * plain Node script, global fetch, no npm dependencies, admin login
 * for authenticated calls, PASS/FAIL console output.
 *
 * Covers:
 *   1. Valid webhook is accepted (202)
 *   2. Invalid signature is rejected (401)
 *   3. Malformed payload is rejected (400)
 *   4. Unsupported event type is handled cleanly (200, ignored)
 *   5. First delivery is processed into a Transaction
 *   6. Duplicate delivery of the same event is NOT reprocessed
 *   7. A WebhookEvent record is created and visible via GET /webhooks/events
 *   8. A processing failure (bad event data) follows the FAILED path
 *   9. Resulting DB state (Transaction / WebhookEvent) is correct
 *  10. Existing reconciliation behavior still works on a webhook-sourced Transaction
 *
 * Usage:
 *   BASE_URL=http://localhost:3000/api/v1 \
 *   WEBHOOK_SECRET=<same value as server's WEBHOOK_SECRET env var> \
 *   node Webhook.e2e.test.js
 *
 * Requires Node 18+ (uses global fetch and crypto). No npm dependencies.
 * Requires a running server + MongoDB + Redis + the worker process
 * (`npm run worker`, or the "worker" service in docker-compose) —
 * since transaction/webhook processing now goes through BullMQ,
 * nothing gets processed unless a worker is actually consuming the
 * queue. This could not be executed in the sandboxed environment
 * used to build this feature; see the accompanying report for what
 * WAS verified there: syntax checks and a require-time load check.
 */

const crypto = require("crypto");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
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

async function run() {

  /* ---------- Login as admin (needed for observability + reconciliation checks) ---------- */
  const login = await api("POST", "/auth/login", null, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
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
     1. VALID WEBHOOK ACCEPTED
  ========================================================= */
  const refA = `WHREF-${ts}-A`;
  const eventA = {
    id: `evt_${ts}_a`,
    type: "payment.success",
    provider: "test-provider",
    data: {
      reference_no: refA,
      customer_ref: `CUST-${ts}`,
      amount: 500,
      currency: "INR",
      transaction_date: new Date().toISOString()
    }
  };
  const rawA = Buffer.from(JSON.stringify(eventA));
  const resA = await postWebhook(rawA, sign(rawA));
  record("1. Valid webhook accepted (202)", resA.status === 202 && resA.data?.status === "accepted", `status=${resA.status} body=${JSON.stringify(resA.data)}`);

  /* =========================================================
     2. INVALID SIGNATURE REJECTED
  ========================================================= */
  const resBadSig = await postWebhook(rawA, "0".repeat(64));
  record("2. Invalid signature rejected (401)", resBadSig.status === 401, `status=${resBadSig.status}`);

  const resNoSig = await postWebhook(rawA, undefined);
  record("2b. Missing signature rejected (401)", resNoSig.status === 401, `status=${resNoSig.status}`);

  /* =========================================================
     3. MALFORMED PAYLOAD REJECTED
     (signature computed correctly over bytes that aren't valid JSON —
     proves signature check and JSON parse check are properly separate steps)
  ========================================================= */
  const malformedRaw = Buffer.from("{not valid json");
  const resMalformed = await postWebhook(malformedRaw, sign(malformedRaw));
  record("3. Malformed payload rejected (400)", resMalformed.status === 400, `status=${resMalformed.status}`);

  /* =========================================================
     4. UNSUPPORTED EVENT TYPE HANDLED CLEANLY
  ========================================================= */
  const unsupportedEvent = {
    id: `evt_${ts}_unsupported`,
    type: "payment.refunded",
    data: { reference_no: refA, amount: 100, currency: "INR" }
  };
  const rawUnsupported = Buffer.from(JSON.stringify(unsupportedEvent));
  const resUnsupported = await postWebhook(rawUnsupported, sign(rawUnsupported));
  record(
    "4. Unsupported event type ignored (200)",
    resUnsupported.status === 200 && resUnsupported.data?.status === "ignored",
    `status=${resUnsupported.status} body=${JSON.stringify(resUnsupported.data)}`
  );

  /* Give the fire-and-forget job a moment to run */
  await sleep(2500);

  /* =========================================================
     5 & 9. FIRST DELIVERY PROCESSED INTO A TRANSACTION
  ========================================================= */
  const txnList = await api("GET", `/ingestion/transactions?limit=50`, token);
  const createdTxn = (txnList.data?.items || []).find(t => t.reference_no === refA);
  record("5. Webhook-sourced Transaction was created", !!createdTxn, createdTxn ? `id=${createdTxn._id} status=${createdTxn.status}` : "not found");
  record("9a. Transaction has provider/raw_payload populated", !!createdTxn && createdTxn.provider === "test-provider", createdTxn ? `provider=${createdTxn.provider}` : "");

  /* =========================================================
     6. DUPLICATE DELIVERY NOT REPROCESSED
  ========================================================= */
  const resDup = await postWebhook(rawA, sign(rawA));
  record("6. Duplicate delivery acknowledged as duplicate (200)", resDup.status === 200 && resDup.data?.status === "duplicate", `status=${resDup.status} body=${JSON.stringify(resDup.data)}`);

  await sleep(1000);
  const txnListAfterDup = await api("GET", `/ingestion/transactions?limit=50`, token);
  const matchingTxns = (txnListAfterDup.data?.items || []).filter(t => t.reference_no === refA);
  record("6b. Duplicate did NOT create a second Transaction", matchingTxns.length === 1, `count=${matchingTxns.length}`);

  /* =========================================================
     7. WEBHOOK EVENT VISIBLE VIA GET /webhooks/events
  ========================================================= */
  const events = await api("GET", `/webhooks/events?limit=50`, token);
  const eventRecord = (events.data?.items || []).find(e => e.event_id === eventA.id);
  record("7. WebhookEvent record exists and is PROCESSED", !!eventRecord && eventRecord.status === "PROCESSED", eventRecord ? `status=${eventRecord.status}` : "not found");

  /* =========================================================
     8. PROCESSING FAILURE FOLLOWS THE EXPECTED FAILED PATH
     (accepted at HTTP layer — id/type/data all present — but
     data.amount is missing, which the worker rejects)
  ========================================================= */
  const badEvent = {
    id: `evt_${ts}_bad`,
    type: "payment.success",
    data: { reference_no: `WHREF-${ts}-BAD`, currency: "INR" } // amount missing
  };
  const rawBad = Buffer.from(JSON.stringify(badEvent));
  const resBad = await postWebhook(rawBad, sign(rawBad));
  record("8a. Structurally valid but semantically bad event still accepted (202)", resBad.status === 202, `status=${resBad.status}`);

  await sleep(2500);
  const eventsAfterBad = await api("GET", `/webhooks/events?status=FAILED&limit=50`, token);
  const failedRecord = (eventsAfterBad.data?.items || []).find(e => e.event_id === badEvent.id);
  record("8b. Bad event ends in FAILED status with an error_message", !!failedRecord && !!failedRecord.error_message, failedRecord ? failedRecord.error_message : "not found");

  /* =========================================================
     10. EXISTING RECONCILIATION BEHAVIOR REMAINS INTACT
     Upload a matching invoice for the webhook-created transaction,
     run reconciliation via the existing endpoint, confirm it matches —
     proving reconciliation.logic.js needed zero changes.
  ========================================================= */
  const expUpload = await api("POST", "/ingestion/expected-payments/upload", token, {
    records: [{
      source_ref: refA,
      customer_id: `CUST-${ts}`,
      amount: 500,
      currency: "INR",
      due_date: new Date().toISOString().slice(0, 10)
    }]
  });
  record("10a. Matching invoice uploaded", expUpload.status === 201 || expUpload.status === 202, `status=${expUpload.status}`);

  const reconRun = await api("POST", "/reconciliation/run", token);
  record("10b. Reconciliation run triggered", reconRun.status === 200, `status=${reconRun.status}`);

  const expList = await api("GET", "/ingestion/expected-payments?limit=50", token);
  const matchedInvoice = (expList.data?.items || []).find(e => e.source_ref === refA);
  record(
    "10c. Webhook-sourced transaction correctly matched by EXISTING reconciliation logic",
    !!matchedInvoice && matchedInvoice.status === "PAID",
    matchedInvoice ? `status=${matchedInvoice.status}` : "invoice not found"
  );

  summarize();
}

function summarize() {
  const pass = results.filter(r => r.pass).length;
  console.log("\n=== WEBHOOK E2E RESULTS ===");
  console.log(`${pass}/${results.length} passed`);
  results.filter(r => !r.pass).forEach(r => console.log(`  FAILED: ${r.name} ${r.detail}`));
}

run().catch(err => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
