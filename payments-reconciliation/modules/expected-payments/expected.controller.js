const csv = require("csv-parser");
const fs = require("fs");
const crypto = require("crypto");

const UploadBatch = require("../../models/UploadBatch");
const ExpectedRepo = require("../../repositories/expected.repo");
const AuditLog = require("../../models/AuditLog");

/*
  Upload Expected Payments
  Supports:
  - JSON
  - CSV
*/
exports.uploadExpectedPayments = async (req, res, next) => {

  try {

    let records = [];

    /* ===============================
       STEP 1: Detect Input Type
    ================================ */

    // JSON
    if (req.is("application/json")) {

      records = req.body.records;

      if (!Array.isArray(records)) {
        return res.status(400).json({
          success: false,
          error: "records must be an array"
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
          error: "Only CSV files allowed"
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
       STEP 2: Validate Records
    ================================ */

    const validRecords = [];
    const invalidRecords = [];

    for (const record of records) {

      const validation = validateRecord(record);

      if (!validation.valid) {

        invalidRecords.push({
          record,
          error: validation.error
        });

        continue;
      }

      validRecords.push(record);
    }


    /* ===============================
       STEP 3: Idempotency Hash
    ================================ */

    const batchHash =
      generateBatchHash(validRecords);

    const exists =
      await ExpectedRepo.checkImportHash(batchHash);

    if (exists) {

      return res.status(409).json({
        success: false,
        error: "Duplicate upload detected"
      });
    }


    /* ===============================
       STEP 4: Normalize + Insert
    ================================ */

    for (const r of validRecords) {

      r.amount = Number(r.amount);
      r.due_date = new Date(r.due_date);
      r.status = "PENDING";
    }

    const inserted =
      await ExpectedRepo.bulkInsert(
        validRecords,
        batchHash,
        req.user.id
      );


    /* ===============================
       STEP 5: Batch Record
    ================================ */

    const batch = await UploadBatch.create({

      user_id: req.user.id,

      type: "expected",

      total_records: records.length,

      imported: inserted.length,

      rejected: invalidRecords.length,

      status: "PENDING"
    });
    
      await AuditLog.create({
      user_id: req.user.id,
      action: "UPLOAD_EXPECTED",
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

        rejected: invalidRecords.length
      }
    });

  }

  catch (error) {

    console.error("Expected Upload Error:", error);

    next(error);
  }
};


/* =================================================
   CSV PARSER
================================================= */

function parseCSV(filePath) {

  return new Promise((resolve, reject) => {

    const results = [];

    fs.createReadStream(filePath)

      .pipe(csv())

      .on("data", data => {
        results.push(data);
      })

      .on("end", () => {

        fs.unlinkSync(filePath);

        resolve(results);
      })

      .on("error", err => {
        reject(err);
      });
  });
}


/* =================================================
   VALIDATION
================================================= */

function validateRecord(record) {

  const requiredFields = [
    "source_ref",
    "customer_id",
    "amount",
    "currency",
    "due_date"
  ];

  for (const field of requiredFields) {

    if (
      record[field] === undefined ||
      record[field] === null ||
      record[field] === ""
    ) {

      return {
        valid: false,
        error: `${field} is required`
      };
    }
  }

  // Default
  if (!record.source_type) {
    record.source_type = "invoice";
  }

  if (isNaN(record.amount) || Number(record.amount) <= 0) {

    return {
      valid: false,
      error: "Invalid amount"
    };
  }

  if (String(record.currency).length !== 3) {

    return {
      valid: false,
      error: "Invalid currency code"
    };
  }

  if (isNaN(Date.parse(record.due_date))) {

    return {
      valid: false,
      error: "Invalid due_date"
    };
  }

  return { valid: true };
}


/* =================================================
   HASH GENERATOR
================================================= */

function generateBatchHash(records) {

  const sorted = records.sort((a, b) =>
    a.source_ref.localeCompare(b.source_ref)
  );

  const payload = JSON.stringify(sorted);

  return crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex");
}
