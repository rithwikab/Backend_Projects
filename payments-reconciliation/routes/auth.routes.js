const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const rbac = require("../middleware/rbac.middleware");

const {
  login
} = require("../modules/auth/auth.controller");

const {
  register
} = require("../modules/auth/register.controller");

/* Login */
router.post("/login", login);

/* Register (Admin only) */
router.post(
  "/register",
  auth,
  rbac(["admin"]),
  register
);

module.exports = router;
