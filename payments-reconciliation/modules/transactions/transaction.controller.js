const csv = require("csv-parser");
const fs = require("fs");
const crypto = require("crypto");

const UploadBatch =
  require("../../models/UploadBatch");

const TransactionRepo =
  require("../../repositories/transaction.repo");

const AuditLog =
  require("../../models/AuditLog");
/*
  Upload Transactions
  Supports:
  - JSON
  - CSV
*/
exports.uploadTransactions = async (req, res, next) => {

  try {

    let records = [];


    /* ===============================
       STEP 1: Detect Input
    ================================ */

    // JSON
    if (req.is("application/json")) {

      records = req.body.records;

      if (!Array.isArray(records)) {

        return res.status(400).json({
          success: false,
          error: "records must be array"
        });
      }
    }

    // CSV
    else if (req.file) {

      const filePath = req.file.path;
      const fileName = req.file.originalname;

      if (!fileName.endsWith(".csv")) {

        fs.unlinkSync(filePath);

        return res.status(400).json({
          success: false,
          error: "Only CSV allowed"
        });
      }

      records = await parseCSV(filePath);
    }

    else {

      return res.status(400).json({
        success: false,
        error: "No data provided"
      });
    }


    /* ===============================
       STEP 2: Validate
    ================================ */

    const valid = [];
    const invalid = [];

    for (const r of records) {

      const v = validate(r);

      if (!v.valid) {

        invalid.push({
          record: r,
          error: v.error
        });

        continue;
      }

      valid.push(r);
    }


    /* ===============================
       STEP 3: Hash
    ================================ */

    const hash = hashBatch(valid);

    const exists =
      await TransactionRepo.checkHash(hash);

    if (exists) {

      return res.status(409).json({
        success: false,
        error: "Duplicate upload"
      });
    }


    /* ===============================
       STEP 4: Normalize + Insert
    ================================ */

    for (const r of valid) {

      r.amount = Number(r.amount);

      r.transaction_date =
        new Date(r.transaction_date);

      r.status = "UNMATCHED";
    }

    const inserted =
      await TransactionRepo.bulkInsert(
        valid,
        hash
      );


    /* ===============================
       STEP 5: Batch
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

    res.status(201).json({

      success: true,

      data: {

        batch_id: batch._id,

        imported: inserted.length,

        rejected: invalid.length
      }
    });

  }

  catch (err) {

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

      .on("data", d => rows.push(d))

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

  const fields = [
    "reference_no",
    "customer_ref",
    "amount",
    "currency",
    "transaction_date"
  ];

  for (const f of fields) {

    if (!r[f]) {

      return {
        valid: false,
        error: `${f} required`
      };
    }
  }

  if (isNaN(r.amount) || r.amount <= 0) {

    return {
      valid: false,
      error: "Invalid amount"
    };
  }

  if (String(r.currency).length !== 3) {

    return {
      valid: false,
      error: "Invalid currency"
    };
  }

  if (isNaN(Date.parse(r.transaction_date))) {

    return {
      valid: false,
      error: "Invalid date"
    };
  }

  return { valid: true };
}


/* =================================================
   HASH
================================================= */

function hashBatch(records) {

  const sorted = records.sort((a, b) =>
    a.reference_no.localeCompare(b.reference_no)
  );

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex");
}
