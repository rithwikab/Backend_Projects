# Payments Reconciliation System

A backend system that automates reconciliation between expected payments (invoices) and actual bank transactions. Designed with asynchronous processing, idempotent ingestion, and role-based access control.

---

# Overview

This system allows organizations to:

* Upload expected payments (invoices)
* Upload bank transactions (JSON/CSV)
* Automatically reconcile payments
* Track mismatches, partial payments, and overpayments
* Audit all operations

The system is designed to simulate **real-world financial reconciliation workflows** with production-like concerns such as idempotency, failure handling, and async processing.

---

# Architecture

```
Client (UI / API Calls)
        ↓
Controller Layer (Validation + Idempotency Check)
        ↓
Async Job Trigger (Non-blocking)
        ↓
Job Processor (Business Logic Execution)
        ↓
Repository Layer (DB Operations)
        ↓
MongoDB
```

---

# Key Design Decisions

## 1. Asynchronous Processing

Uploads are accepted immediately and processed in the background.

**Why:**

* Prevents API blocking for large datasets
* Improves scalability and responsiveness

---

## 2. Idempotent Ingestion

* Each upload is hashed (batch-level)
* Duplicate uploads are rejected

**Why:**

* Prevents duplicate financial records
* Ensures consistency in repeated uploads

---

## 3. Record-Level Deduplication

* Each transaction has a `payload_hash`
* Prevents duplicate transaction inserts

---

## 4. Reconciliation Logic

Matching is based on:

* `reference_no` ↔ `source_ref`
* Aggregation of multiple transactions per invoice

### Supported Cases:

| Case              | Behavior                |
| ----------------- | ----------------------- |
| Exact match       | Marked as **PAID**      |
| Partial payment   | Marked as **PARTIAL**   |
| No transaction    | Remains **PENDING**     |
| Extra transaction | Marked as **UNMATCHED** |

---

## 5. Role-Based Access Control (RBAC)

| Role       | Permissions                        |
| ---------- | ---------------------------------- |
| Admin      | Full access (upload, audit, users) |
| Operations | Upload + reconciliation            |
| Analyst    | Read-only access                   |

---

## 6. Failure Handling

* Partial insert handling in bulk operations
* UploadBatch tracks status (`PROCESSED`, `FAILED`)
* Audit logs capture all system actions

---

## 7. Webhook Payment Ingestion

A payment provider can notify this system directly, instead of (or in addition to) manually uploading transaction files.

```
Payment Provider
    ↓
POST /api/v1/webhooks/payments
    ↓
HMAC-SHA256 signature verification (middleware/webhookSignature.middleware.js)
    ↓
Validate event shape (id / type / data)
    ↓
Idempotency check + persist (models/WebhookEvent.js, unique on provider+event_id)
    ↓
Async processing — reuses the existing fire-and-forget job pattern (jobs/webhook.job.js)
    ↓
Existing transaction ingestion path (repositories/transaction.repo.js)
    ↓
Existing, UNCHANGED reconciliation logic (services/reconciliation.logic.js)
```

### Configuration

Add to `.env`:

```
WEBHOOK_SECRET=your_webhook_secret
```

### Endpoint

`POST /api/v1/webhooks/payments` — no JWT required; authenticated via signature instead.

`GET /api/v1/webhooks/events` — admin/analyst only, lists received webhook events (same access pattern as `/audit`).

### Signature

The header `x-webhook-signature` must be the hex-encoded HMAC-SHA256 of the **raw request body**, keyed with `WEBHOOK_SECRET`:

```bash
BODY='{"id":"evt_123","type":"payment.success","data":{"reference_no":"INV-101","customer_ref":"C1","amount":1000,"currency":"INR","transaction_date":"2026-02-02"}}'
SIGNATURE=$(node -e "console.log(require('crypto').createHmac('sha256', process.env.WEBHOOK_SECRET).update(process.argv[1]).digest('hex'))" "$BODY")

curl -X POST http://localhost:3000/api/v1/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$BODY"
```

### Event format

```json
{
  "id": "evt_123",
  "type": "payment.success",
  "provider": "generic",
  "data": {
    "reference_no": "INV-101",
    "customer_ref": "C1",
    "amount": 1000,
    "currency": "INR",
    "transaction_date": "2026-02-02"
  }
}
```

Supported `type` values: `payment.success`, `payment.failed`. Any other type is acknowledged with `200 { status: "ignored" }` and not processed.

### Responses

| Situation | Status | Body `status` |
| --- | --- | --- |
| Accepted, first delivery | 202 | `accepted` |
| Duplicate delivery (same `event_id`) | 200 | `duplicate` |
| Unsupported event type | 200 | `ignored` |
| Missing/invalid signature | 401 | — |
| Malformed JSON / missing required fields | 400 | — |
| Server/config error | 500 | — |

### Idempotency

Uniqueness key: `provider + event_id`, DB-enforced via a unique index on `WebhookEvent` — the same hash/unique-index pattern already used for `UploadBatch.batch_hash` and `Transaction.payload_hash`. A `payment.success` event is additionally deduplicated at the resulting `Transaction`'s `payload_hash`, so the same underlying payment can't be double-counted even if it arrives via webhook AND a manual upload.

### Running the webhook tests

```bash
BASE_URL=http://localhost:3000/api/v1 \
WEBHOOK_SECRET=dev_webhook_secret_change_me \
node Webhook.e2e.test.js
```

Requires the server and MongoDB running (same requirement as `Reconciliation.e2e.test.js`).

---

## 8. Background Processing (Redis + BullMQ)

Transaction uploads, webhook events, and reconciliation are processed by **BullMQ**, backed by Redis — run by a separate `worker.js` process, not inline in the API process.

```
API process (server.js)                    Worker process (worker.js)
─────────────────────────                  ──────────────────────────
POST /transactions/upload                   workers/transaction.worker.js
  → transactionQueue.add(...)  ──Redis──►     → processTransactionUpload()

POST /webhooks/payments                     workers/webhook.worker.js
  → webhookQueue.add(...)      ──Redis──►     → processWebhookEvent()

(startup) reconciliationQueue               workers/reconciliation.worker.js
  .add(..., {repeat: "0 */6 * * *"}) ──►      → runReconciliation() every 6h
```

**Why a separate process, not just a library call:** the job is durably written to Redis *before* the API responds — if the API process crashes right after responding, the job survives and the worker (a different, independently-running process) still picks it up. The previous fire-and-forget version couldn't guarantee that; see `WEBHOOK_INTERVIEW_NOTES.md` for the full before/after.

**Retry behavior:** each job retries up to 3 times with exponential backoff (`queues/*.js`) before being marked as permanently failed (`UploadBatch.status`/`WebhookEvent.status` = `FAILED`, written by the worker's `failed` event, not by the job function itself).

**Running locally (two processes now, not one):**

```bash
# terminal 1
npm run dev

# terminal 2
npm run worker
```

Or via Docker, both are already separate services:

```bash
docker-compose up --build
```

**Env var:**

```
REDIS_URL=redis://localhost:6379    # or redis://redis:6379 inside docker-compose
```

---

# Project Structure

```
modules/
  transactions/
  expected-payments/
  webhooks/

jobs/
  transaction.job.js
  webhook.job.js
  reconcile.job.js

queues/
  connection.js
  transactionQueue.js
  webhookQueue.js
  reconciliationQueue.js

workers/
  transaction.worker.js
  webhook.worker.js
  reconciliation.worker.js

worker.js

repositories/
  transaction.repo.js

models/
  Transaction.js
  UploadBatch.js
  AuditLog.js
  WebhookEvent.js

routes/
  ingestion.routes.js
  webhook.routes.js

middleware/
  webhookSignature.middleware.js

config/
  db.js
```

---

# Docker Setup

## 1. Build & Run

```bash
docker-compose up --build
```

---

## 2. Services

* **App** → Node.js API (port 3000)
* **Worker** → Node.js background job processor (no exposed port — consumes from Redis)
* **MongoDB** → port 27017
* **Redis** → port 6379

---

## 3. Environment

```
MONGO_URI=mongodb://mongo:27017/reconciliation_db
JWT_SECRET=your_secret
JWT_EXPIRES_IN=1h
WEBHOOK_SECRET=your_webhook_secret
REDIS_URL=redis://redis:6379
```

---
## 🔑 Default Admin Access

To access the application after starting Docker, use the following credentials:

```text
Email: admin@test.com
Password: 123456
```

> Note: Ensure this user exists in the database. If not, you can manually insert it using MongoDB:

```bash
docker exec -it <mongo-container-name> mongosh
```

```js
use reconciliation_db

db.users.insertOne({
  email: "admin@test.com",
  password: "<bcrypt-hash-of-123456>",
  roles: ["admin"],
  createdAt: new Date(),
  updatedAt: new Date()
})
```

# Sample Test Flow

## Step 1 — Upload Expected Payments

```json
[
  { "source_ref": "INV-101", "customer_id": "C1", "amount": 1000, "currency": "INR", "due_date": "2026-02-01" }
]
```

---

## Step 2 — Upload Transactions

```json
[
  { "reference_no": "INV-101", "customer_ref": "C1", "amount": 1000, "currency": "INR", "transaction_date": "2026-02-02" }
]
```

---

## Step 3 — Run Reconciliation

System matches records and updates status.

---

# Core Features

* ✅ Async ingestion pipeline
* ✅ Idempotent uploads
* ✅ Partial & multi-transaction matching
* ✅ Audit logging
* ✅ Role-based authorization
* ✅ Dockerized deployment

---

# Scalability Considerations

Future improvements:

* Replace in-memory jobs with **queue system (Redis/Kafka)**
* Add **horizontal scaling with worker services**
* Introduce **event-driven reconciliation**

---

# Tradeoffs

| Decision               | Tradeoff                              |
| ---------------------- | ------------------------------------- |
| MongoDB                | Flexible schema vs strong consistency |
| Async jobs             | Better performance vs complexity      |
| Hash-based idempotency | Fast dedupe vs collision risk (low)   |

---

# Challenges Solved

* Handling duplicate uploads safely
* Supporting partial payments across multiple transactions
* Avoiding bulk insert failures due to unique constraints
* Ensuring system consistency with async processing

---

# What I Learned

* Designing idempotent systems
* Handling partial failures in distributed workflows
* Structuring backend systems with separation of concerns
* Debugging real-world data consistency issues

---

# Conclusion

This project demonstrates a production-oriented backend system with:

* Clean architecture
* Real-world financial logic
* Scalable design patterns

---

# Author

Built as part of backend engineering preparation for SDE roles.
