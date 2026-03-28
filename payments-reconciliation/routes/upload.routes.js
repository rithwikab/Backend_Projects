const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");

const {
  getMyUploads
} = require("../modules/uploads/upload.controller");


router.get(
  "/my",
  auth,
  getMyUploads
);

module.exports = router;
