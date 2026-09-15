const rateLimit = require("express-rate-limit");

/*
  express-rate-limit was already a listed dependency in this
  project but wasn't wired into any route — a real, pre-existing
  gap. Wiring it into the two endpoints that most need it.
*/

/*
  Login: brute-force guard. 10 attempts per 15 minutes per IP is
  generous enough for a real user mistyping a password a few times,
  tight enough to make password-guessing impractical.
*/
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many login attempts. Please try again later."
  }
});

/*
  Webhooks: a real payment provider can legitimately burst several
  events close together, so this is much looser than the login
  limiter — it exists to cap abuse (e.g. someone hammering the
  endpoint with invalid signatures), not to throttle normal
  provider traffic.
*/
exports.webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests."
  }
});