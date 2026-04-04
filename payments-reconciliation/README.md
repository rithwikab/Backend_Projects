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

# Project Structure

```
modules/
  transactions/
  expected-payments/

jobs/
  transaction.job.js

repositories/
  transaction.repo.js

models/
  Transaction.js
  UploadBatch.js
  AuditLog.js

routes/
  ingestion.routes.js

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

* **App** → Node.js (port 3000)
* **MongoDB** → port 27017

---

## 3. Environment

```
MONGO_URI=mongodb://mongo:27017/reconciliation_db
JWT_SECRET=your_secret
JWT_EXPIRES_IN=1h
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
