const crypto = require("crypto");

/*
  Verifies the HMAC-SHA256 signature of an inbound webhook BEFORE
  any part of the request body is trusted, parsed, or acted on.

  Expects:
    - req.body to be the RAW request Buffer, not parsed JSON.
      (see app.js — express.raw() is scoped to /api/v1/webhooks
      and mounted BEFORE the global express.json() parser, so the
      exact bytes the provider signed are what we verify against —
      verifying a re-serialized JSON.stringify() of a parsed body
      would silently break on key ordering / whitespace differences)
    - header "x-webhook-signature": hex HMAC-SHA256 of the raw
      body, keyed with process.env.WEBHOOK_SECRET

  On success, attaches req.rawBody (Buffer) for the controller to
  parse. Parsing untrusted JSON only happens AFTER this middleware
  has confirmed the bytes are authentic — that ordering is the
  entire point of doing this as separate middleware rather than
  inline in the controller.
*/
module.exports = (req, res, next) => {

  const signature = req.headers["x-webhook-signature"];
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    // Misconfiguration on our side, not the caller's fault.
    return res.status(500).json({
      success: false,
      error: "Webhook secret not configured"
    });
  }

  if (!signature) {
    return res.status(401).json({
      success: false,
      error: "Missing signature"
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    // Raw body wasn't captured — most likely this route isn't
    // reachable through the scoped express.raw() middleware.
    return res.status(400).json({
      success: false,
      error: "Raw body unavailable"
    });
  }

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  let providedBuf, expectedBuf;
  try {
    providedBuf = Buffer.from(signature, "hex");
    expectedBuf = Buffer.from(expectedHex, "hex");
  } catch {
    return res.status(401).json({ success: false, error: "Invalid signature" });
  }

  const valid =
    providedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!valid) {
    return res.status(401).json({
      success: false,
      error: "Invalid signature"
    });
  }

  req.rawBody = req.body;
  next();
};
