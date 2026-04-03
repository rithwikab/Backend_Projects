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


  // Show register only for admin
  if (role === "admin") {

    document.getElementById("nav-register")
      .style.display = "inline-block";
  }

  document.getElementById("nav-logout")
    .style.display = "inline-block";
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
