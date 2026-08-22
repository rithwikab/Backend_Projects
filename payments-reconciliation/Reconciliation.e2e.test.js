/**
 * End-to-end reconciliation test.
 *
 * Generates synthetic ExpectedPayment + Transaction records covering all
 * 5 matching rules, uploads them via JSON (no CSV files needed), triggers
 * reconciliation, then cross-checks the summary, expected-payment list,
 * transaction list, and audit log all together.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000/api/v1 node reconciliation.e2e.test.js
 *
 * Requires Node 18+ (uses global fetch). No npm dependencies.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";

const ts = Date.now(); // uniqueness salt so repeat runs never collide with old data
const results = []; // { name, pass, detail }

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

// ---------- Fixture builders ----------
// Rule 1: PERFECT_MATCH  -> exact ref + exact amount + currency
// Rule 2: PARTIAL_MATCH  -> ref match, partial sum < expected
// Rule 2: AGGREGATED_MATCH (by ref) -> ref match, multiple tx sum == expected
// Rule 3: AMOUNT_MATCH   -> no ref match, but customer+amount+currency+within 7 days
// Rule 4: AGGREGATED_MATCH (no ref) -> no ref match, customer+currency, sum == expected
// Rule 5: MISSING        -> no transactions at all
// Extra: one transaction that matches nothing -> stays UNMATCHED

const today = new Date().toISOString().slice(0, 10);

const expectedPayments = [
  { source_ref: `T${ts}-1`, customer_id: `C${ts}-1`, amount: 1000, currency: "INR", due_date: today }, // -> PERFECT_MATCH
  { source_ref: `T${ts}-2`, customer_id: `C${ts}-2`, amount: 1000, currency: "INR", due_date: today }, // -> PARTIAL_MATCH
  { source_ref: `T${ts}-3`, customer_id: `C${ts}-3`, amount: 1000, currency: "INR", due_date: today }, // -> AGGREGATED_MATCH (by ref)
  { source_ref: `T${ts}-4`, customer_id: `C${ts}-4`, amount: 750, currency: "INR", due_date: today },  // -> AMOUNT_MATCH
  { source_ref: `T${ts}-5`, customer_id: `C${ts}-5`, amount: 500, currency: "INR", due_date: today },  // -> AGGREGATED_MATCH (no ref)
  { source_ref: `T${ts}-6`, customer_id: `C${ts}-6`, amount: 999, currency: "INR", due_date: today },  // -> MISSING
];

const transactions = [
  // Rule 1: exact match
  { reference_no: `T${ts}-1`, customer_ref: `C${ts}-1`, amount: 1000, currency: "INR", transaction_date: today },
  // Rule 2 partial: only 400 of 1000
  { reference_no: `T${ts}-2`, customer_ref: `C${ts}-2`, amount: 400, currency: "INR", transaction_date: today },
  // Rule 2 aggregated by ref: 600 + 400 = 1000
  { reference_no: `T${ts}-3`, customer_ref: `C${ts}-3`, amount: 600, currency: "INR", transaction_date: today },
  { reference_no: `T${ts}-3`, customer_ref: `C${ts}-3`, amount: 400, currency: "INR", transaction_date: today },
  // Rule 3: different ref, same customer+amount, within 7 days
  { reference_no: `NOREF-${ts}-A`, customer_ref: `C${ts}-4`, amount: 750, currency: "INR", transaction_date: today },
  // Rule 4: different refs, same customer, sums to 500 (300+200), neither alone == 500
  { reference_no: `NOREF-${ts}-B`, customer_ref: `C${ts}-5`, amount: 300, currency: "INR", transaction_date: today },
  { reference_no: `NOREF-${ts}-C`, customer_ref: `C${ts}-5`, amount: 200, currency: "INR", transaction_date: today },
  // Orphan: matches nothing, should stay UNMATCHED
  { reference_no: `ORPHAN-${ts}`, customer_ref: `C${ts}-ORPHAN`, amount: 111, currency: "INR", transaction_date: today },
];

// ---------- Main flow ----------
(async () => {
  console.log(`\nRunning against ${BASE_URL}\n`);

  // 1. Login
  const login = await api("POST", "/auth/login", null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const token =
  login.data?.data?.access_token ||
  login.data?.data?.token ||
  login.data?.token;
  record("Admin login succeeds", login.status === 200 && !!token, `status=${login.status}`);
  if (!token) {
    console.log("\nAborting: no auth token obtained. Check ADMIN_EMAIL/ADMIN_PASSWORD/BASE_URL.");
    printSummary();
    process.exit(1);
  }

  // 2. Upload expected payments (JSON path)
  const expUpload = await api("POST", "/ingestion/expected-payments/upload", token, { records: expectedPayments });
  record(
    "Expected payments upload accepted",
    expUpload.status === 201,
    `status=${expUpload.status} imported=${expUpload.data?.data?.imported}`
  );

  // 3. Upload transactions (JSON path) - this is fire-and-forget (202), so we poll afterward
  const txUpload = await api("POST", "/ingestion/transactions/upload", token, { records: transactions });
  record(
    "Transaction upload accepted",
    txUpload.status === 202,
    `status=${txUpload.status} imported=${txUpload.data?.data?.imported}`
  );

  // 4. Poll until all expected transactions actually land (background job needs time)
  const expectedTxCount = transactions.length;
  let landed = 0;
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(500);
    const list = await api("GET", `/ingestion/transactions?limit=100`, token);
    const rows = list.data?.data?.items || list.data?.items || [];
    landed = rows.filter(r => r.reference_no?.includes(`${ts}`)).length;
    if (landed >= expectedTxCount) break;
  }
  record(
    "All uploaded transactions landed in DB before reconciliation",
    landed >= expectedTxCount,
    `landed=${landed}/${expectedTxCount}`
  );

  // 5. Trigger reconciliation
  const run = await api("POST", "/reconciliation/run", token);
  record("Reconciliation run succeeds", run.status === 200, `status=${run.status} body=${JSON.stringify(run.data)}`);

  // 6. Fetch summary
  const summary = await api("GET", "/reconciliation/summary", token);
  record("Reconciliation summary fetched", summary.status === 200, JSON.stringify(summary.data?.data || summary.data));

  // 7. Fetch expected payments and check per-record status
  const expList = await api("GET", "/ingestion/expected-payments?limit=100", token);
  const expRows = expList.data?.data?.items || expList.data?.items || [];
  const byRef = ref => expRows.find(r => r.source_ref === ref);

  const checks = [
    [`T${ts}-1`, "PAID", "PERFECT_MATCH -> should be PAID"],
    [`T${ts}-2`, "PARTIAL", "PARTIAL_MATCH -> should be PARTIAL"],
    [`T${ts}-3`, "PAID", "AGGREGATED_MATCH by ref -> should be PAID"],
    [`T${ts}-4`, "PAID", "AMOUNT_MATCH -> should be PAID"],
    [`T${ts}-5`, "PAID", "AGGREGATED_MATCH no ref -> should be PAID"],
    [`T${ts}-6`, "PENDING", "MISSING -> should stay PENDING"],
  ];
  for (const [ref, expectedStatus, label] of checks) {
    const row = byRef(ref);
    record(`Expected payment ${ref}: ${label}`, row?.status === expectedStatus, `actual=${row?.status}`);
  }

  // 8. Fetch transactions and check orphan stays UNMATCHED
  const txList = await api("GET", "/ingestion/transactions?limit=100", token);
  const txRows = txList.data?.data?.items || txList.data?.items || [];
  const orphan = txRows.find(r => r.reference_no === `ORPHAN-${ts}`);
  record("Orphan transaction stays UNMATCHED", orphan?.status === "UNMATCHED", `actual=${orphan?.status}`);

  const partialTx = txRows.find(r => r.reference_no === `T${ts}-2`);
  record("Partial-match transaction marked PARTIAL", partialTx?.status === "PARTIAL", `actual=${partialTx?.status}`);

  // 9. Fetch audit log and check both uploads were recorded
  const audit = await api("GET", "/audit?limit=100", token);
  const auditRows = audit.data?.data?.items || audit.data?.items || [];
  const hasExpectedUpload = auditRows.some(a => a.action === "UPLOAD_EXPECTED");
  const hasTxUpload = auditRows.some(a => a.action === "UPLOAD_TRANSACTION");
  record("Audit log has UPLOAD_EXPECTED entry", hasExpectedUpload);
  record("Audit log has UPLOAD_TRANSACTION entry", hasTxUpload);

  printSummary();
})().catch(err => {
  console.error("Test run crashed:", err);
  process.exit(1);
});

function printSummary() {
  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log(`\n${"=".repeat(50)}\n${passed} passed, ${failed} failed (${results.length} total)\n${"=".repeat(50)}`);
  if (failed > 0) process.exitCode = 1;
}