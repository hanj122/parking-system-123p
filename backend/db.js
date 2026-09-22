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

    db.run(
      `INSERT INTO demand_forecasts
              (nature, event_date, event_time, category)
             SELECT nature, event_date, event_time, category
             FROM forecast_events old
             WHERE NOT EXISTS (
               SELECT 1 FROM demand_forecasts current
               WHERE current.nature = old.nature
                 AND current.event_date = old.event_date
                 AND current.event_time = old.event_time
                 AND current.category = old.category
             )`,
      (migrationError) => {
        if (migrationError)
          console.error("Forecast migration failed", migrationError);
      },
    );

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
