const path = require("path");
const fs = require("fs");
const db = require("../backend/db.js");

const sqlPath = path.join(__dirname, "analytics-demo.sql");

if (!fs.existsSync(sqlPath)) {
  console.error("ERROR: analytics-demo.sql was not found.");
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");

console.log("Seeding analytics demo dataset into Supabase PostgreSQL...");

db.run(sql, (err) => {
  if (err) {
    console.error("Seed error:", err.message);
    process.exit(1);
  }

  console.log("✅ Analytics demo dataset inserted successfully into Supabase.");
  process.exit(0);
});