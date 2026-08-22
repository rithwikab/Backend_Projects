const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const routes = require("./routes");
const errorHandler = require("./middleware/error.middleware");

const app = express();

/* ---------------- Middleware ---------------- */

app.use(cors());

/*
  Raw body capture for webhook signature verification — MUST be
  mounted, scoped to this one path, BEFORE express.json() below.
  Body-parser skips re-parsing a body that's already been read
  (req._body flag), so this only affects /api/v1/webhooks/* —
  every other route is parsed by express.json() exactly as before.
*/
app.use(
  "/api/v1/webhooks",
  express.raw({ type: "application/json", limit: "1mb" })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan("dev"));

/* ---------------- Static Frontend ---------------- */

app.use(express.static("public"));

/* ---------------- Routes ---------------- */
/* Root Redirect */

app.get("/", (req, res) => {
  res.sendFile(
    __dirname + "/public/pages/redirect.html"
  );
});
app.post("/test-upload", (req, res) => {
  //console.log("TEST BODY:", req.body);
  res.json({ ok: true });
});

app.use("/api/v1", routes);
app.use(
  "/api/v1/uploads",
  require("./routes/upload.routes")
);

/* ---------------- Health Check ---------------- */

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

/* ---------------- Error Handler ---------------- */

app.use(errorHandler);

module.exports = app;
