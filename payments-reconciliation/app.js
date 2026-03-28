const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const routes = require("./routes");
const errorHandler = require("./middleware/error.middleware");

const app = express();

/* ---------------- Middleware ---------------- */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
  console.log("TEST BODY:", req.body);
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
