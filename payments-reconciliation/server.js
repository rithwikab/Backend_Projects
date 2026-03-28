require("dotenv").config();

const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 3000;

/* ---------------- Start Server ---------------- */

async function start() {

  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });
}

start();
