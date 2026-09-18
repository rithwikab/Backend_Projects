/**
 * demo-seed.js
 *
 * Populates a deployed instance with realistic-looking data covering
 * every major feature, purely over HTTP — no shell access to the
 * server needed at all. Run this from your OWN machine, pointed at
 * your live Render URL.
 *
 * Demonstrates, in order:
 *   1. Bulk JSON invoice upload
 *   2. Bulk JSON transaction upload (perfect match, partial match,
 *      and a fuzzy no-reference match)
 *   3. CSV invoice upload (multipart file upload)
 *   4. Two webhook events (payment.success)
 *   5. Triggering reconciliation
 *   6. Printing a human-readable summary — matched / partial /
 *      missing / pending review counts, plus the pending-review
 *      queue itself (the suggested-match feature)
 *
 * Usage:
 *   BASE_URL=https://your-app.onrender.com/api/v1 \
 *   ADMIN_EMAIL=admin@test.com \
 *   ADMIN_PASSWORD=admin123 \
 *   WEBHOOK_SECRET=<same value set on Render> \
 *   node demo-seed.js
 *
 * Fully self-contained — the CSV file it uploads is generated on
 * the fly (with unique references) and deleted afterward, so this
 * is safe to re-run as many times as you want before your demo.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "dev_webhook_secret_change_me";

const ts = Date.now();

function log(msg) {
  console.log(msg);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function api(method, pathSuffix, token, body) {
  const res = await fetch(`${BASE_URL}${pathSuffix}`, {
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

function sign(rawBody) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

async function postWebhook(rawBody) {
  const res = await fetch(`${BASE_URL}/webhooks/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-signature": sign(rawBody)
    },
    body: rawBody
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

async function uploadCSV(token, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), path.basename(filePath));

  const res = await fetch(`${BASE_URL}/ingestion/expected-payments/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

async function run() {

  log(`\nRunning demo seed against ${BASE_URL}\n`);

  /* ---------- 1. Login ---------- */
  const login = await api("POST", "/auth/login", null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const token = login.data?.data?.access_token || login.data?.data?.token || login.data?.token;
  if (!token) {
    console.error("Login failed:", JSON.stringify(login.data));
    process.exit(1);
  }
  log(`Logged in as ${ADMIN_EMAIL}`);

  /* ---------- 2. Bulk JSON invoices ---------- */
  const refPerfect = `DEMO-${ts}-PERFECT`;
  const refPartial = `DEMO-${ts}-PARTIAL`;
  const refFuzzy = `DEMO-${ts}-FUZZY`;
  const refMissing = `DEMO-${ts}-MISSING`;
  const customer = `CUST-DEMO-${ts}`;

  const expUpload = await api("POST", "/ingestion/expected-payments/upload", token, {
    records: [
      { source_ref: refPerfect, customer_id: customer, amount: 500, currency: "INR", due_date: "2026-08-26" },
      { source_ref: refPartial, customer_id: customer, amount: 700, currency: "INR", due_date: "2026-08-26" },
      { source_ref: refFuzzy, customer_id: customer, amount: 300, currency: "INR", due_date: "2026-08-26" },
      { source_ref: refMissing, customer_id: customer, amount: 400, currency: "INR", due_date: "2026-08-26" }
    ]
  });
  log(`Uploaded 4 invoices (JSON) — status ${expUpload.status}, imported: ${expUpload.data?.data?.imported ?? "?"}`);

  /* ---------- 3. Bulk JSON transactions ---------- */
  const txUpload = await api("POST", "/ingestion/transactions/upload", token, {
    records: [
      // Perfect match — same reference, same amount
      { reference_no: refPerfect, customer_ref: customer, amount: 500, currency: "INR", transaction_date: "2026-08-26" },
      // Two partials that sum to the invoice amount (reference-based)
      { reference_no: refPartial, customer_ref: customer, amount: 400, currency: "INR", transaction_date: "2026-08-24" },
      { reference_no: refPartial, customer_ref: customer, amount: 300, currency: "INR", transaction_date: "2026-08-25" },
      // Fuzzy match — NO reference at all, same customer + exact amount, within 7 days
      { reference_no: `RANDOM-REF-${ts}`, customer_ref: customer, amount: 300, currency: "INR", transaction_date: "2026-08-27" }
    ]
  });
  log(`Uploaded 4 transactions (JSON) — status ${txUpload.status}`);

  /* ---------- 4. CSV upload ---------- */
  // Generated here (not a static file) so re-running this script
  // never collides with a previous run's batch_hash.
  const csvRefB1 = `DEMO-${ts}-CSV-B1`;
  const csvRefB2 = `DEMO-${ts}-CSV-B2`;
  const csvContent =
    "source_ref,customer_id,amount,currency,due_date\n" +
    `${csvRefB1},${customer},150,INR,2026-08-26\n` +
    `${csvRefB2},${customer},250,INR,2026-08-26\n`;

  const csvPath = path.join(__dirname, `demo-invoices-${ts}.csv`);
  fs.writeFileSync(csvPath, csvContent);

  const csvResult = await uploadCSV(token, csvPath);
  log(`Uploaded invoices via CSV — status ${csvResult.status}, imported: ${csvResult.data?.data?.imported ?? "?"}`);

  fs.unlinkSync(csvPath); // clean up the temp file we generated above

  /* ---------- 5. Webhook events ---------- */
  const refWebhook = `DEMO-${ts}-WEBHOOK`;

  // Invoice for the webhook payment to eventually match against
  await api("POST", "/ingestion/expected-payments/upload", token, {
    records: [{ source_ref: refWebhook, customer_id: customer, amount: 900, currency: "INR", due_date: "2026-08-26" }]
  });

  const webhookEvent = {
    id: `evt_demo_seed_${ts}`,
    type: "payment.success",
    provider: "demo-bank",
    data: { reference_no: refWebhook, customer_ref: customer, amount: 900, currency: "INR", transaction_date: "2026-08-26" }
  };
  const rawEvent = Buffer.from(JSON.stringify(webhookEvent));
  const webhookRes = await postWebhook(rawEvent);
  log(`Sent webhook payment.success event — status ${webhookRes.status}, result: ${webhookRes.data?.status}`);

  log("\nWaiting 5 seconds for background processing (CSV insert, webhook -> transaction)...");
  await sleep(5000);

  /* ---------- 6. Run reconciliation ---------- */
  const reconRun = await api("POST", "/reconciliation/run", token);
  log(`\nReconciliation run — status ${reconRun.status}`);
  log(JSON.stringify(reconRun.data, null, 2));

  /* ---------- 7. Summary ---------- */
  const summary = await api("GET", "/reconciliation/summary", token);
  log("\n=== DASHBOARD SUMMARY ===");
  log(JSON.stringify(summary.data, null, 2));

  const pending = await api("GET", "/reconciliation/pending-review?limit=20", token);
  const pendingItems = pending.data?.data?.items || [];
  log(`\n=== PENDING REVIEW (${pendingItems.length}) — fuzzy matches awaiting human confirmation ===`);
  pendingItems.forEach(item => {
    log(`  - Invoice ${item.expected_payment_id?.source_ref}: suggested method ${item.status}, amount ${item.expected_payment_id?.amount}`);
  });

  log("\nDone. Log in to the app and open the dashboard / pending-review screen to show this live.\n");
}

run().catch(err => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});