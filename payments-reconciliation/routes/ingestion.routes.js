const express = require("express");
const router = express.Router();

/* Middlewares */
const auth = require("../middleware/auth.middleware");
const rbac = require("../middleware/rbac.middleware");

/* Controllers */
const {
  uploadExpectedPayments
} = require("../modules/expected-payments/expected.controller");

const {
  uploadTransactions
} = require("../modules/transactions/transaction.controller");

/*
  Route: Upload expected payments (CSV / JSON)
  Access: Admin, Operations
*/
const upload =
  require("../middleware/upload.middleware");


router.post(
  "/expected-payments/upload",
  auth,
  rbac(["admin", "operations"]),
  upload.single("file"),   // 👈 enables file
  uploadExpectedPayments
);


/*
  Route: Upload bank transactions (JSON)
  Access: Admin, Operations
*/
router.post(
  "/transactions/upload",
  auth,
  rbac(["admin", "operations"]),
  upload.single("file"),
  uploadTransactions
);
const {
  listExpectedPayments
} = require(
  "../modules/expected-payments/expected.list.controller"
);

router.get(
  "/expected-payments",
  auth,
  listExpectedPayments
);


module.exports = router;
