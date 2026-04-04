const csv = require("csv-parser");
const fs = require("fs");
const crypto = require("crypto");

const TransactionRepo = require("../../repositories/transaction.repo");

const {
  processTransactionUpload
} = require("../../jobs/transaction.job");

/*
  Upload Transactions
*/
exports.uploadTransactions = async (req, res, next) => {
  try {

    /* ===============================
       STEP 1: EXTRACT INPUT
    ================================ */

    let records = [];

    if (req.is("application/json")) {

      records = Array.isArray(req.body)
        ? req.body
        : req.body.records;

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

    console.log("RAW BODY:", req.body);
    console.log("RECORDS:", records);

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

    console.log("VALID:", valid.length);
    console.log("INVALID:", invalid.length);

    /* 🚨 CRITICAL FIX — EARLY RETURN */

    if (valid.length === 0) {
      return res.status(400).json({
        success: false,
        error: "All records invalid",
        rejected: invalid.length
      });
    }

    /* ===============================
       STEP 3: IDEMPOTENCY CHECK
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
       STEP 4: ASYNC PROCESSING
    ================================ */

    processTransactionUpload({
      records: valid,
      user_id: req.user.id,
      hash,
      invalidCount: invalid.length,
      totalRecords: records.length
    });

    /* ===============================
       RESPONSE
    ================================ */

    return res.status(202).json({
      success: true,
      message: "Upload accepted, processing in background",
      data: {
        total: records.length,
        imported: valid.length,
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

  if (!r.reference_no) {
    return { valid: false, error: "reference_no required" };
  }

  if (!r.customer_ref) {
    return { valid: false, error: "customer_ref required" };
  }

  if (r.amount === undefined || isNaN(r.amount) || Number(r.amount) <= 0) {
    return { valid: false, error: "Invalid amount" };
  }

  if (!r.currency || String(r.currency).length !== 3) {
    return { valid: false, error: "Invalid currency" };
  }

  if (!r.transaction_date || isNaN(Date.parse(r.transaction_date))) {
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
    .update(JSON.stringify(
      sorted.map(r => ({
        reference_no: r.reference_no,
        amount: r.amount,
        transaction_date: r.transaction_date
      }))
    ))
    .digest("hex");
}
exports.getTransactions = async (req, res) => {
  try {

    const { cursor, limit, status } = req.query;

    const result =
      await TransactionRepo.getPaginatedTransactions({
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