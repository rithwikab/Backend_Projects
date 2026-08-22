const csv = require("csv-parser");
const fs = require("fs");

function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", row => rows.push(row))
      .on("end", () => {
        fs.unlinkSync(filePath);
        resolve(rows);
      })
      .on("error", reject);
  });
}

module.exports = { parseCSV };