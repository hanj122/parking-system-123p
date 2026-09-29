const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "..", "backend", "database.sqlite");
const sqlPath = path.join(__dirname, "analytics-demo.sql");

console.log("Database:", dbPath);
console.log("SQL file:", sqlPath);

if (!fs.existsSync(sqlPath)) {
  console.error("ERROR: analytics-demo.sql was not found.");
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error("ERROR: database.sqlite was not found.");
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database error:", err.message);
    process.exit(1);
  }

  console.log("Database opened.");
});

db.exec(sql, (err) => {
  if (err) {
    console.error("Seed error:", err.message);
    db.close();
    process.exit(1);
  }

  console.log("Analytics demo dataset inserted successfully.");

  db.close((closeErr) => {
    if (closeErr) {
      console.error("Close error:", closeErr?.message);
      process.exit(closeErr ? 1 : 0);
    }

    console.log("Done.");
  });
});