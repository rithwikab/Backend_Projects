const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const rbac = require("../middleware/rbac.middleware");
const verifySignature = require("../middleware/webhookSignature.middleware");
const { webhookLimiter } = require("../middleware/rateLimiter.middleware");

const {
  handlePaymentWebhook,
  listWebhookEvents
} = require("../modules/webhooks/webhook.controller");

/*
  Route: Receive a payment provider webhook event.
  Access: none (external caller, not one of our own users) —
  authenticated via HMAC signature instead of a JWT. See
  webhookSignature.middleware.js and app.js (raw body capture).
  Rate-limited BEFORE signature verification — reject cheaply
  before spending a HMAC computation on abusive traffic.
*/
router.post(
  "/payments",
  webhookLimiter,
  verifySignature,
  handlePaymentWebhook
);

/*
  Route: List received webhook events (observability/debugging).
  Access: Admin, Analyst — same gating as /audit, since this is
  effectively another audit surface.
*/
router.get(
  "/events",
  auth,
  rbac(["admin", "analyst"]),
  listWebhookEvents
);

module.exports = router;