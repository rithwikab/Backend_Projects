const express = require("express");
const router = express.Router();

/* Import route modules */
const authRoutes = require("./auth.routes");
const ingestionRoutes = require("./ingestion.routes");
const reconciliationRoutes = require("./reconciliation.routes");

/* Register routes */
router.use("/auth", authRoutes);
router.use("/ingestion", ingestionRoutes);
router.use("/reconciliation", reconciliationRoutes);
router.use("/audit",require("./audit.routes"));
router.use("/webhooks", require("./webhook.routes"));
module.exports = router;
