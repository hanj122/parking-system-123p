const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

function initDb() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  db.exec(schema, (err) => {
    if (err) {
      console.error("Error executing schema", err);
      return;
    }

    // Enable foreign keys
    db.run("PRAGMA foreign_keys = ON");

    // Migration for tickets columns
    for (const column of ["map_latitude", "map_longitude"]) {
      db.run(`ALTER TABLE tickets ADD COLUMN ${column} REAL`, (columnError) => {
        if (
          columnError &&
          !columnError.message.includes("duplicate column name")
        ) {
          console.error(
            `Ticket map column migration failed for ${column}`,
            columnError,
          );
        }
      });
    }

    // Migration for demand_forecasts columns
    db.run(
      `ALTER TABLE demand_forecasts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`,
      () => {
        db.run(
          `ALTER TABLE demand_forecasts ADD COLUMN external_id TEXT`,
          () => {
            db.run(
              `CREATE UNIQUE INDEX IF NOT EXISTS idx_forecast_dedup ON demand_forecasts(source, external_id)`,
              (indexErr) => {
                if (indexErr) {
                  console.error(
                    "Failed to create forecast dedup index:",
                    indexErr.message,
                  );
                }
              },
            );
          },
        );
      },
    );

    // Migration for lot_location radius_km column
    db.run(
      "ALTER TABLE lot_location ADD COLUMN radius_km REAL NOT NULL DEFAULT 3.0",
      (radErr) => {
        if (radErr && !radErr.message.includes("duplicate column name")) {
          // ignore already existing column
        }
      },
    );

    // Initialize default lot location if not already present
    db.get("SELECT COUNT(*) AS count FROM lot_location", (err, row) => {
      if (!err && row && row.count === 0) {
        db.run(
          "INSERT OR IGNORE INTO lot_location (id, latitude, longitude, radius_km) VALUES (1, 14.5995, 120.9842, 3.0)",
          (insErr) => {
            if (insErr)
              console.error("Failed to seed default lot location:", insErr);
          },
        );
      }
    });

    // Check if slots are initialized
    db.get("SELECT COUNT(*) as count FROM slots", (err, row) => {
      if (err) {
        console.error(err);
        return;
      }
      if (row.count === 0) {
        console.log("Initializing slots...");
        let stmt = db.prepare(
          "INSERT INTO slots (id, floor, status) VALUES (?, ?, ?)",
        );

        db.serialize(() => {
          // Floor 1: 100-199
          for (let i = 100; i <= 199; i++) {
            stmt.run(i, 1, "available");
          }
          // Floor 2: 200-299
          for (let i = 200; i <= 299; i++) {
            stmt.run(i, 2, "available");
          }
          // Floor 3: 300-399
          for (let i = 300; i <= 399; i++) {
            stmt.run(i, 3, "available");
          }
          stmt.finalize();
        });
        console.log("Slots initialized.");
      }
    });
  });
}

initDb();

module.exports = db;
