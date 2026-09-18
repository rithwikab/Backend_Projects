/* =================================================
   GLOBAL STATE
================================================= */

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");


/* =================================================
   AUTH GUARD
================================================= */

function requireAuth() {

  const path = window.location.pathname;

  // Public pages (no auth required)
  if (
    path.includes("login.html") ||
    path.includes("register.html")
  ) {
    return;
  }

  // Protected pages
  if (!token) {

    window.location.replace("/pages/login.html");
  }
}



/* =================================================
   NAVBAR LOADER (ROLE BASED)
================================================= */

async function loadNavbar() {

  if (!token) return;
  if (document.getElementById("main-navbar")) return;
  const res = await fetch("/partials/navbar.html");
  const html = await res.text();

  document.body.insertAdjacentHTML(
    "afterbegin",
    html
  );

  const role = localStorage.getItem("role");

  // Hide upload for non admin/ops
  if (!["admin", "operations"].includes(role)) {

    document.getElementById("nav-upload")
      .style.display = "none";
  }

  if (!["admin", "analyst"].includes(role)) {
  document.getElementById("nav-audit")
    .style.display = "none";
  }

  // Pending Review -- admin only. The review workflow changes
  // financial status (confirming/rejecting a suggested match), so
  // it is gated even tighter than audit -- analysts can view/audit
  // but not decide a match.
  if (role === "admin") {
    document.getElementById("nav-review")
      .style.display = "inline-block";
  }

  // Show register only for admin
  if (role === "admin") {

    document.getElementById("nav-register")
      .style.display = "inline-block";
  }

  document.getElementById("nav-logout")
    .style.display = "inline-block";

  // Start the live upload-status badge (visible on every page, not
  // just the Upload page) -- polls every 8s, and only while the tab
  // is actually visible, so it does not hammer the API in a
  // background tab.
  loadUploadBadge();
  setInterval(() => {
    if (document.visibilityState === "visible") loadUploadBadge();
  }, 8000);
}


/* =================================================
   LOGIN
================================================= */

document
  .getElementById("loginForm")
  ?.addEventListener("submit", async e => {

    e.preventDefault();

    const email =
      document.getElementById("email").value;

    const password =
      document.getElementById("password").value;

    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.success) {

      localStorage.setItem(
        "token",
        data.data.access_token
      );

      localStorage.setItem(
        "role",
        data.data.user.role
      );

      window.location.href =
        "/pages/dashboard.html";

    } else {

      showMessage("Login failed", "error");
    }
});


/* =================================================
   LOGOUT
================================================= */

function logout() {

  localStorage.clear();

  window.location.replace("/pages/login.html");
}



/* =================================================
   REGISTER (ADMIN ONLY)
================================================= */

document
  .getElementById("registerForm")
  ?.addEventListener("submit", async e => {

    e.preventDefault();

    if (role !== "admin") {

      showMessage("Access denied", "error");
      return;
    }

    const email =
      document.getElementById("regEmail").value;

    const password =
      document.getElementById("regPassword").value;

    const roleSel =
      document.getElementById("regRole").value;

    const res = await fetch(
      "/api/v1/auth/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          email,
          password,
          role: roleSel
        })
      }
    );

    const data = await res.json();

    if (data.success) {

      showMessage(
        "User registered successfully",
        "success"
      );

      document
        .getElementById("registerForm")
        .reset();

    } else {

      showMessage(
        data.error || "Registration failed",
        "error"
      );
    }
});


/* =================================================
   MESSAGE HANDLER
================================================= */

function showMessage(msg, type) {

  const box =
    document.getElementById("messageBox");

  if (!box) return;

  box.style.display = "block";

  box.className =
    "message-box " +
    (type === "success"
      ? "msg-success"
      : "msg-error");

  box.innerText = msg;
}


/* =================================================
   UPLOAD FUNCTIONS
================================================= */

async function uploadExpected() {

  const raw =
    document.getElementById("expectedData").value;

  if (!raw) {

    showMessage("Paste JSON first", "error");
    return;
  }

  let records;

  try {

    records = JSON.parse(raw);

  } catch {

    showMessage("Invalid JSON", "error");
    return;
  }

  const res = await fetch(
    "/api/v1/ingestion/expected-payments/upload",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ records })
    }
  );

  const data = await res.json();

  showMessageFromAPI(data);

  loadHistory(true);
}


async function uploadTransactions() {

  const raw =
    document.getElementById("txnData").value;

  if (!raw) {

    showMessage("Paste JSON first", "error");
    return;
  }

  let records;

  try {

    records = JSON.parse(raw);

  } catch {

    showMessage("Invalid JSON", "error");
    return;
  }

  const res = await fetch(
    "/api/v1/ingestion/transactions/upload",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ records })
    }
  );

  const data = await res.json();

  showMessageFromAPI(data);

  loadHistory(true);
}


/* =================================================
   HISTORY (UPLOAD BATCHES)
================================================= */

let historyCursor = null;

async function loadHistory(reset = false) {

  if (reset) historyCursor = null;

  let url =
    "/api/v1/uploads/my?limit=5";

  if (historyCursor) {
    url += "&cursor=" + historyCursor;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const data = await res.json();

  if (!data.success) return;

  const tbody =
    document.querySelector(
      "#historyTable tbody"
    );

  if (reset) tbody.innerHTML = "";

  const existing = new Set();

  tbody.querySelectorAll("tr").forEach(r => {
    existing.add(r.dataset.id);
  });

  data.data.items.forEach(b => {

    if (existing.has(b._id)) return;

    const tr = document.createElement("tr");

    tr.dataset.id = b._id;

    tr.innerHTML = `
      <td>${b.type}</td>
      <td>${b.imported}</td>
      <td>${b.status}</td>
      <td>${new Date(b.createdAt).toLocaleDateString()}</td>
    `;

    tbody.appendChild(tr);
  });

  historyCursor = data.data.nextCursor;
}



/* =================================================
   DASHBOARD
================================================= */

async function runReconciliation() {

  await fetch(
    "/api/v1/reconciliation/run",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    }
  );

  showMessage(
    "Reconciliation completed",
    "success"
  );

  loadSummary();
  loadExpectedPayments();
}


/* ---------------- Summary ---------------- */

async function loadSummary() {

  const res = await fetch(
    "/api/v1/reconciliation/summary",
    {
      headers: {
        Authorization: "Bearer " + token
      }
    }
  );

  const data = await res.json();

  if (!data.success) return;

  const box =
    document.getElementById("summaryBox");

  box.innerHTML = `

    <h3>Summary</h3>

    <p>Matched: ${data.data.matched}</p>
    <p>Partial: ${data.data.partial}</p>
    <p>Missing: ${data.data.missing}</p>
    <p>Unmatched: ${data.data.unmatched}</p>
    <p>Pending Review: ${data.data.pendingReview ?? 0}</p>

  `;
}


/* ---------------- Expected Payments ---------------- */

let expectedCursor = null;

async function loadExpectedPayments() {

  let url =
    "/api/v1/ingestion/expected-payments?limit=10";

  if (expectedCursor) {
    url += "&cursor=" + expectedCursor;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const data = await res.json();

  if (!data.success) return;

  renderExpectedTable(data.data.items);

  if (!data.data.hasMore) {

  document.getElementById("loadMoreBtn")
    .style.display = "none";
}

  expectedCursor = data.data.nextCursor;
}


function renderExpectedTable(items) {

  const tbody =
    document.getElementById("expectedTableBody");

  const existingIds = new Set();

  // Collect already rendered IDs
  tbody.querySelectorAll("tr").forEach(row => {
    existingIds.add(row.dataset.id);
  });

  for (const e of items) {

    // Skip duplicates
    if (existingIds.has(e._id)) continue;

    const row = document.createElement("tr");

    row.dataset.id = e._id;

    row.innerHTML = `
      <td>${e.source_ref}</td>
      <td>${e.customer_id}</td>
      <td>${e.amount}</td>
      <td>${e.currency}</td>
      <td>${e.status}</td>
      <td>${new Date(e.createdAt).toLocaleString()}</td>
    `;

    tbody.appendChild(row);
  }
}



/* =================================================
   PAGE INITIALIZER
================================================= */

document.addEventListener("DOMContentLoaded", () => {

  requireAuth();

  loadNavbar();

  const path = window.location.pathname;

  /* Upload Page */
  if (path.includes("upload.html")) {

    initUpload();
  }

  /* Dashboard Page */
  if (path.includes("dashboard.html")) {

    initDashboard();
  }

  /* Pending Review Page (admin only) */
  if (path.includes("review.html")) {

    initReview();
  }
});


function initUpload() {

  const role =
    localStorage.getItem("role");

  if (!["admin", "operations"].includes(role)) {

    document.getElementById("uploadSection")
      .style.display = "none";

    showMessage("Read-only access", "error");

    return;
  }

  loadHistory(true);
}


function initDashboard() {

  const role =
    localStorage.getItem("role");

  // Hide Run button for Analyst & Viewer
  if (!["admin", "operations"].includes(role)) {

    const btn =
      document.getElementById("runReconBtn");

    if (btn) btn.style.display = "none";
  }

  expectedCursor = null;

  document.getElementById("expectedTableBody")
    .innerHTML = "";

  loadSummary();
  loadExpectedPayments();
}



/* =================================================
   API MESSAGE FORMATTER
================================================= */

function showMessageFromAPI(data) {

  if (!data.success) {
    showMessage(data.error || "Failed", "error");
    return;
  }

  const { imported = 0, rejected = 0 } = data.data || {};

  if (imported === 0 && rejected > 0) {
    showMessage(
      `All records rejected (${rejected})`,
      "error"
    );
    return;
  }

  showMessage(
    `Imported: ${imported}, Rejected: ${rejected}`,
    "success"
  );
}
/* ===============================
   FILE UPLOAD (CSV)
================================ */

async function uploadExpectedFile() {

  const fileInput =
    document.getElementById("expectedFile");

  if (!fileInput.files.length) {

    showMessage("Select a CSV file", "error");
    return;
  }

  const formData = new FormData();

  formData.append(
    "file",
    fileInput.files[0]
  );

  const res = await fetch(
    "/api/v1/ingestion/expected-payments/upload",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      },
      body: formData
    }
  );

  const data = await res.json();

  showMessageFromAPI(data);

  fileInput.value = "";

  loadHistory(true);
}


/* ===============================
   JSON UPLOAD (WRAPPER)
================================ */

async function uploadExpectedJSON() {

  uploadExpected(); // reuse existing logic
}
/* ===============================
   TRANSACTION CSV UPLOAD
================================ */

async function uploadTransactionFile() {

  const input =
    document.getElementById("txnFile");

  if (!input.files.length) {

    showMessage("Select CSV file", "error");
    return;
  }

  const fd = new FormData();

  fd.append("file", input.files[0]);

  const res = await fetch(
    "/api/v1/ingestion/transactions/upload",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      },
      body: fd
    }
  );

  const data = await res.json();

  showMessageFromAPI(data);

  input.value = "";

  loadHistory(true);
}
let auditCursor = null;

async function loadAudit(reset = false) {

  if (reset) auditCursor = null;

  let url = "/api/v1/audit?limit=5";

  if (auditCursor) {
    url += "&cursor=" + auditCursor;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const data = await res.json();

  if (!data.success) return;

  const tbody =
    document.querySelector("#auditTable tbody");

  if (reset) tbody.innerHTML = "";

  data.data.items.forEach(l => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${l.user_id?.email || "SYSTEM"}</td>
      <td>${l.action}</td>
      <td>${new Date(l.createdAt).toLocaleString()}</td>
    `;

    tbody.appendChild(tr);
  });

  auditCursor = data.data.nextCursor;
}


/* =================================================
   UPLOAD STATUS BADGE (navbar, all pages)
================================================= */

async function loadUploadBadge() {

  const badge = document.getElementById("nav-upload-badge");
  if (!badge) return;

  try {

    const res = await fetch("/api/v1/uploads/my?limit=5", {
      headers: { Authorization: "Bearer " + token }
    });

    const data = await res.json();

    if (!data.success) return;

    const items = data.data.items || [];

    if (items.length === 0) {
      badge.style.display = "none";
      return;
    }

    const pendingCount = items.filter(b => b.status === "PENDING").length;
    const dot = document.getElementById("upload-badge-dot");
    const text = document.getElementById("upload-badge-text");

    badge.style.display = "inline-flex";

    if (pendingCount > 0) {
      dot.className = "badge-dot badge-dot-pending";
      text.innerText = `${pendingCount} upload${pendingCount > 1 ? "s" : ""} processing...`;
    } else {
      const latest = items[0];
      dot.className =
        "badge-dot " +
        (latest.status === "FAILED" ? "badge-dot-failed" : "badge-dot-ok");
      text.innerText =
        latest.status === "FAILED"
          ? "Last upload failed"
          : "Uploads up to date";
    }

  } catch (e) {
    // Non-critical (a badge failing to refresh shouldn't disrupt
    // the rest of the page) -- silently skip this cycle.
  }
}


/* =================================================
   PENDING REVIEW (admin only)
================================================= */

function initReview() {

  const role = localStorage.getItem("role");

  if (role !== "admin") {

    document.getElementById("reviewSection").style.display = "none";
    document.getElementById("rejectedSection").style.display = "none";
    showMessage("Admin access only", "error");
    return;
  }

  loadPendingReview();
  loadRejectedHistory();
}


async function loadPendingReview() {

  const res = await fetch("/api/v1/reconciliation/pending-review?limit=50", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();

  if (!data.success) {
    showMessage(data.error || "Failed to load pending review", "error");
    return;
  }

  renderReviewTable(
    data.data.items || [],
    "reviewTableBody",
    "reviewEmptyMsg",
    true // show Confirm/Reject buttons
  );
}


/*
  Read-only history of matches a human already rejected. Kept as a
  SEPARATE table/query (review_status=REJECTED) from the actionable
  pending queue above -- see services/reconciliation.service.js's
  buildPairingSignature, which now stops a rejected pairing from
  ever being re-inserted into the PENDING_REVIEW table again. This
  is just where that history becomes visible, clearly labeled as
  old, instead of disappearing entirely.
*/
async function loadRejectedHistory() {

  const res = await fetch("/api/v1/reconciliation/pending-review?limit=50&review_status=REJECTED", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();

  if (!data.success) return;

  renderReviewTable(
    data.data.items || [],
    "rejectedTableBody",
    "rejectedEmptyMsg",
    false // no action buttons -- this is history, not a queue
  );
}


function renderReviewTable(items, tbodyId, emptyMsgId, showActions) {

  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";

  const emptyMsg = document.getElementById(emptyMsgId);

  if (items.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }

  emptyMsg.style.display = "none";

  for (const item of items) {

    const exp = item.expected_payment_id || {};
    const txns = item.actual_transaction_ids || [];

    const row = document.createElement("tr");
    row.dataset.id = item._id;

    const actionsCell = showActions
      ? `<td class="review-actions">
          <button class="btn-confirm" onclick="confirmReview('${item._id}')">Confirm</button>
          <button class="btn-reject" onclick="rejectReview('${item._id}')">Reject</button>
        </td>`
      : "";

    row.innerHTML = `
      <td>${exp.source_ref || "—"}</td>
      <td>${exp.customer_id || "—"}</td>
      <td>${exp.amount ?? "—"} ${exp.currency || ""}</td>
      <td>${item.status}</td>
      <td>${txns.map(t => t.reference_no).join(", ") || "—"}</td>
      ${actionsCell}
    `;

    tbody.appendChild(row);
  }
}


async function confirmReview(id) {

  const res = await fetch(`/api/v1/reconciliation/${id}/confirm`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  handleReviewActionResult(data, "confirmed");
}


async function rejectReview(id) {

  const res = await fetch(`/api/v1/reconciliation/${id}/reject`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  handleReviewActionResult(data, "rejected");
}


function handleReviewActionResult(data, verb) {

  if (!data.success) {
    showMessage(data.error || `Failed to mark as ${verb}`, "error");
    return;
  }

  // Every confirm/reject also triggers a fresh reconciliation run
  // server-side (services/reconciliation.service.js) -- surface
  // what that rerun found, not just the single action's result.
  const rerun = data.data?.rerun;

  if (rerun && rerun.reconciled) {
    showMessage(
      `Match ${verb}. Reconciliation re-run: ${rerun.autoConfirmed} auto-confirmed, ${rerun.pendingReview} new pending review.`,
      "success"
    );
  } else {
    showMessage(`Match ${verb}.`, "success");
  }

  loadPendingReview();
  loadRejectedHistory();
}