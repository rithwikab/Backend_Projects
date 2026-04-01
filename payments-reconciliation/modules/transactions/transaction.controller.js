const csv = require("csv-parser");
const fs = require("fs");
const crypto = require("crypto");

const UploadBatch = require("../../models/UploadBatch");
const TransactionRepo = require("../../repositories/transaction.repo");
const AuditLog = require("../../models/AuditLog");

/*
  Upload Transactions
  Supports: JSON, CSV
*/
exports.uploadTransactions = async (req, res, next) => {
  try {

    /* ===============================
       STEP 1: EXTRACT INPUT
    ================================ */

    let records = [];

    if (req.is("application/json")) {
      records = req.body.records;

      if (!Array.isArray(records)) {
        return res.status(400).json({
          success: false,
          error: "records must be array"
        });
      }

    } else if (req.file) {
      const { path: filePath, originalname } = req.file;

      if (!originalname.endsWith(".csv")) {
        fs.unlinkSync(filePath);
        return res.status(400).json({
          success: false,
          error: "Only CSV allowed"
        });
      }

      records = await parseCSV(filePath);

    } else {
      return res.status(400).json({
        success: false,
        error: "No data provided"
      });
    }


    /* ===============================
       STEP 2: VALIDATION
    ================================ */

    const valid = [];
    const invalid = [];

    for (const r of records) {
      const result = validate(r);

      if (!result.valid) {
        invalid.push({ record: r, error: result.error });
        continue;
      }

      valid.push(r);
    }


    /* ===============================
       STEP 3: IDEMPOTENCY CHECK (HASH)
    ================================ */

    const hash = hashBatch(valid);

    const exists = await TransactionRepo.checkHash(hash);

    if (exists) {
      return res.status(409).json({
        success: false,
        error: "Duplicate upload"
      });
    }


    /* ===============================
       STEP 4: NORMALIZE DATA
    ================================ */

    const normalized = valid.map(r => ({
      ...r,
      amount: Number(r.amount),
      transaction_date: new Date(r.transaction_date),
      status: "UNMATCHED"
    }));


    /* ===============================
       STEP 5: INSERT
    ================================ */

    const inserted = await TransactionRepo.bulkInsert(
      normalized,
      hash
    );


    /* ===============================
       STEP 6: CREATE BATCH
    ================================ */

    const batch = await UploadBatch.create({
      user_id: req.user.id,
      type: "transaction",
      total_records: records.length,
      imported: inserted.length,
      rejected: invalid.length,
      status: "PENDING"
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: "UPLOAD_TRANSACTION",
      meta: { batch_id: batch._id }
    });


    /* ===============================
       RESPONSE
    ================================ */

    return res.status(201).json({
      success: true,
      data: {
        batch_id: batch._id,
        imported: inserted.length,
        rejected: invalid.length
      }
    });

  } catch (err) {
    console.error("Txn Upload:", err);
    next(err);
  }
};


/* =================================================
   CSV PARSER
================================================= */

function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", row => rows.push(row))
      .on("end", () => {
        fs.unlinkSync(filePath);
        resolve(rows);
      })
      .on("error", reject);
  });
}


/* =================================================
   VALIDATION
================================================= */

function validate(r) {

  const requiredFields = [
    "reference_no",
    "customer_ref",
    "amount",
    "currency",
    "transaction_date"
  ];

  for (const field of requiredFields) {
    if (!r[field]) {
      return { valid: false, error: `${field} required` };
    }
  }

  if (isNaN(r.amount) || r.amount <= 0) {
    return { valid: false, error: "Invalid amount" };
  }

  if (String(r.currency).length !== 3) {
    return { valid: false, error: "Invalid currency" };
  }

  if (isNaN(Date.parse(r.transaction_date))) {
    return { valid: false, error: "Invalid date" };
  }

  return { valid: true };
}


/* =================================================
   HASH (FOR IDEMPOTENCY)
================================================= */

function hashBatch(records) {

  const sorted = [...records].sort((a, b) =>
    a.reference_no.localeCompare(b.reference_no)
  );

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex");
}
const transactionRepo =
  require("../../repositories/transaction.repo");

/*
  Get Transactions (Pagination + Filtering)
*/
exports.getTransactions = async (req, res) => {

  try {

    const { cursor, limit, status } = req.query;

    const result =
      await transactionRepo.getPaginatedTransactions({
        cursor,
        limit,
        status
      });

    return res.json(result);

  } catch (err) {

    console.error("Get Transactions Error:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch transactions"
    });
  }
};