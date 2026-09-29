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

    db.run(
      "ALTER TABLE tickets ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'car'",
      (colErr) => {
        if (colErr && !colErr.message.includes("duplicate column name")) {
          console.error("Ticket vehicle_type column migration failed", colErr);
        }
      },
    );

    for (const columnDef of [
      "brand TEXT",
      "color TEXT",
      "year INTEGER",
      "plate_number TEXT",
      "mv_file_number TEXT",
    ]) {
      db.run(`ALTER TABLE tickets ADD COLUMN ${columnDef}`, (colErr) => {
        if (colErr && !colErr.message.includes("duplicate column name")) {
          console.error(`Ticket column migration failed for ${columnDef}`, colErr);
        }
      });
    }

    db.run(
      "ALTER TABLE slots ADD COLUMN reserved_for TEXT DEFAULT NULL",
      (colErr) => {
        if (colErr && !colErr.message.includes("duplicate column name")) {
          console.error("Slots reserved_for column migration failed", colErr);
        }
      },
    );

    db.run(
      "ALTER TABLE slots ADD COLUMN capacity INTEGER NOT NULL DEFAULT 1",
      (colErr) => {
        if (colErr && !colErr.message.includes("duplicate column name")) {
          console.error("Slots capacity column migration failed", colErr);
        }
      },
    );

    // Check if slots are initialized
    db.get("SELECT COUNT(*) as count FROM slots", (err, row) => {
      if (err) {
        console.error(err);
        return;
      }
      if (row.count === 0) {
        console.log("Initializing slots...");
        let stmt = db.prepare(
          "INSERT INTO slots (id, floor, status, reserved_for, capacity) VALUES (?, ?, ?, ?, ?)",
        );

        db.serialize(() => {
          // Floor 1: 100-199 (100-119 reserved for motorcycles, capacity 6)
          for (let i = 100; i <= 199; i++) {
            const isMcReserved = i >= 100 && i <= 119;
            stmt.run(
              i,
              1,
              "available",
              isMcReserved ? "motorcycle" : null,
              isMcReserved ? 6 : 1,
            );
          }
          // Floor 2: 200-299
          for (let i = 200; i <= 299; i++) {
            stmt.run(i, 2, "available", null, 1);
          }
          // Floor 3: 300-399
          for (let i = 300; i <= 399; i++) {
            stmt.run(i, 3, "available", null, 1);
          }
          stmt.finalize();
        });
        console.log("Slots initialized.");
      } else {
        db.serialize(() => {
          db.run(
            "UPDATE slots SET reserved_for = 'motorcycle', capacity = 6 WHERE floor = 1 AND id BETWEEN 100 AND 119",
          );
          db.run(
            "UPDATE slots SET reserved_for = NULL, capacity = 1 WHERE NOT (floor = 1 AND id BETWEEN 100 AND 119)",
          );

          // Relocate any pre-existing active car tickets in 100-119 to free car slots (>= 120) so no car occupancy is lost and 100-119 are strictly motorcycle-only
          db.all(
            "SELECT id, slot_id FROM tickets WHERE status = 'active' AND COALESCE(vehicle_type, 'car') = 'car' AND slot_id BETWEEN 100 AND 119 ORDER BY id ASC",
            (carErr, legacyCarTickets) => {
              if (carErr || !legacyCarTickets || legacyCarTickets.length === 0) return;
              db.all(
                "SELECT id FROM slots WHERE id >= 120 AND id NOT IN (SELECT slot_id FROM tickets WHERE status = 'active') ORDER BY floor ASC, id ASC",
                (slotErr, freeCarSlots) => {
                  if (slotErr || !freeCarSlots) return;
                  db.serialize(() => {
                    legacyCarTickets.forEach((ticket, idx) => {
                      const targetSlot = freeCarSlots[idx];
                      if (targetSlot) {
                        db.run("UPDATE tickets SET slot_id = ? WHERE id = ?", [
                          targetSlot.id,
                          ticket.id,
                        ]);
                        db.run("UPDATE slots SET status = 'occupied' WHERE id = ?", [
                          targetSlot.id,
                        ]);
                      }
                    });
                  });
                },
              );
            },
          );
        });
      }
    });
  });
}

initDb();

module.exports = db;
