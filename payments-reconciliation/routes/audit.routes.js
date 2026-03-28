const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const rbac = require("../middleware/rbac.middleware");

const {
  getAuditLogs
} = require("../modules/audit/audit.controller");

router.get(
  "/",
  auth,
  rbac(["admin", "analyst"]),
  getAuditLogs
);

module.exports = router;
