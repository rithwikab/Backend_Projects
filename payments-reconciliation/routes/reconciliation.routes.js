const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const rbac = require("../middleware/rbac.middleware");

const {
  triggerReconciliation,
  getSummary,
  listPendingReview,
  confirmMatch,
  rejectMatch
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

/*
  NEW: low-confidence (amount-only, no invoice reference) matches
  wait here for a human to confirm or reject before they can change
  any ExpectedPayment/Transaction status. See
  services/reconciliation.logic.js's requiresReview and
  services/reconciliation.service.js's runReconciliation.
*/

/* List matches awaiting review */
router.get(
  "/pending-review",
  auth,
  rbac(["admin", "operations"]),
  listPendingReview
);

/* Approve a suggested match */
router.post(
  "/:id/confirm",
  auth,
  rbac(["admin", "operations"]),
  confirmMatch
);

/* Reject a suggested match */
router.post(
  "/:id/reject",
  auth,
  rbac(["admin", "operations"]),
  rejectMatch
);

module.exports = router;