const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const rbac = require("../middleware/rbac.middleware");

const {
  triggerReconciliation,
  getSummary
} = require("../modules/reconciliation/reconciliation.controller");


/* Run reconciliation */
router.post(
  "/run",
  auth,
  rbac(["admin", "operations"]),
  triggerReconciliation
);

/* Get summary */
router.get(
  "/summary",
  auth,
  getSummary
);

module.exports = router;
