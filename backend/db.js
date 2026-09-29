try {
  require("dotenv").config();
} catch (e) {}

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

<<<<<<< HEAD
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
=======
const connectionString = process.env.DATABASE_URL;
let sslConfig = false;
if (connectionString) {
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  const isSslDisabled = connectionString.includes("sslmode=disable");
  if (!isLocal && !isSslDisabled) {
    sslConfig = { rejectUnauthorized: false };
  }
>>>>>>> 46bb2e91a5c6c14402a6313d068c0dc7c83fb3cb
}

// Automatically connects to your Supabase DATABASE_URL from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
});

const COMPAT_SQL = `
CREATE OR REPLACE FUNCTION date(val text) RETURNS date AS $$
BEGIN
  IF val = 'now' THEN
    RETURN (NOW() AT TIME ZONE 'Asia/Manila')::date;
  END IF;
  RETURN SUBSTRING(val FROM 1 FOR 10)::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(val text, modifier text) RETURNS text AS $$
BEGIN
  IF val = 'now' THEN
    IF modifier LIKE '-%day%' THEN
      RETURN TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila' - INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSIF modifier LIKE '+%day%' THEN
      RETURN TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila' + INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSE
      RETURN TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD');
    END IF;
  ELSE
    IF modifier LIKE '-%day%' THEN
      RETURN TO_CHAR((SUBSTRING(val FROM 1 FOR 10)::date - INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSIF modifier LIKE '+%day%' THEN
      RETURN TO_CHAR((SUBSTRING(val FROM 1 FOR 10)::date + INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSE
      RETURN SUBSTRING(val FROM 1 FOR 10);
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(val text, modifier text, tz text) RETURNS text AS $$
BEGIN
  IF val = 'now' THEN
    IF modifier LIKE '-%day%' THEN
      RETURN TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila' - INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSIF modifier LIKE '+%day%' THEN
      RETURN TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila' + INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSE
      RETURN TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD');
    END IF;
  ELSE
    IF modifier LIKE '-%day%' THEN
      RETURN TO_CHAR((SUBSTRING(val FROM 1 FOR 10)::date - INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSIF modifier LIKE '+%day%' THEN
      RETURN TO_CHAR((SUBSTRING(val FROM 1 FOR 10)::date + INTERVAL '1 day'), 'YYYY-MM-DD');
    ELSE
      RETURN SUBSTRING(val FROM 1 FOR 10);
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION strftime(fmt text, val text) RETURNS text AS $$
BEGIN
  IF fmt = '%H' THEN
    RETURN SUBSTRING(val FROM 12 FOR 2);
  ELSE
    RETURN val;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
`;

let initPromise = null;

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("\n========================================================================");
    console.warn("⚠️  DATABASE_URL environment variable is NOT SET!");
    console.warn("   If running on Render:");
    console.warn("   1. Open Render Dashboard -> Your Web Service -> Environment");
    console.warn("   2. Add Key: DATABASE_URL, Value: your Supabase / PostgreSQL URI");
    console.warn("========================================================================\n");
    return;
  }

  let client;
  try {
    client = await pool.connect();
    console.log("✅ Successfully connected to Supabase PostgreSQL database!");

    // 1. Provision compatibility functions
    await client.query(COMPAT_SQL);

    // 2. Provision database schema
    const schemaPath = path.join(__dirname, "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, "utf8");
      await client.query(schemaSql);
      console.log("✅ Database schema verified (slots, tickets, reports, forecasts).");
    }

    // 3. Ensure slots table has 300 spaces
    const slotsRes = await client.query("SELECT COUNT(*) AS count FROM slots;");
    const slotCount = parseInt(slotsRes.rows[0].count, 10);
    if (slotCount === 0) {
      console.log("🌱 Slots table is empty. Initializing 300 parking spaces...");
      for (let i = 100; i <= 399; i++) {
        const floor = Math.floor(i / 100);
        const isMc = floor === 1 && i >= 100 && i <= 119;
        await client.query(
          `INSERT INTO slots (id, floor, status, reserved_for, capacity)
           VALUES ($1, $2, 'available', $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             floor = EXCLUDED.floor,
             reserved_for = EXCLUDED.reserved_for,
             capacity = EXCLUDED.capacity;`,
          [i, floor, isMc ? "motorcycle" : null, isMc ? 6 : 1]
        );
      }
      console.log("✅ 300 slots initialized (Slots 100-119 reserved for motorcycles, capacity 6).");
    }

    // 4. Ensure tickets table has data
    const ticketsRes = await client.query("SELECT COUNT(*) AS count FROM tickets;");
    const ticketCount = parseInt(ticketsRes.rows[0].count, 10);
    if (ticketCount === 0) {
      console.log("🌱 Tickets table is empty. Auto-seeding synthetic operational data...");
      try {
        const { seedDataset } = require("../data/seed-supabase");
        await seedDataset(client, { clearExisting: false });
        console.log("✅ Database auto-seeded with 30-day realistic telemetry data!");
      } catch (seedErr) {
        console.error("⚠️ Auto-seeding notice:", seedErr.message);
      }
    } else {
      console.log(`ℹ️ Operational data ready: ${ticketCount} tickets, ${slotCount || 300} slots.`);
    }
  } catch (err) {
    console.error("❌ Database initialization error:", err.message);
  } finally {
    if (client) client.release();
  }
}

// Trigger automatic initialization on launch
initPromise = initDatabase();

// Converts standard "?" positional placeholders to PostgreSQL "$1, $2, $3"
function formatSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const db = {
  pool,
  initPromise,
  reseed: async (options = { clearExisting: true }) => {
    const { seedDataset } = require("../data/seed-supabase");
    return await seedDataset(pool, options);
  },

  // Handles db.all(sql, params, callback)
  all: async (sql, params, callback) => {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    if (!process.env.DATABASE_URL) {
      const err = new Error(
        "DATABASE_URL is not set. Please configure DATABASE_URL in your Render Environment."
      );
      return callback ? callback(err) : null;
    }
    if (initPromise) {
      try {
        await initPromise;
      } catch (e) {}
    }
    const query = formatSql(sql);
    pool.query(query, params || [], (err, res) => {
      if (err) return callback ? callback(err) : null;
      if (callback) callback(null, res.rows);
    });
  },

  // Handles db.get(sql, params, callback)
  get: async (sql, params, callback) => {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    if (!process.env.DATABASE_URL) {
      const err = new Error(
        "DATABASE_URL is not set. Please configure DATABASE_URL in your Render Environment."
      );
      return callback ? callback(err) : null;
    }
    if (initPromise) {
      try {
        await initPromise;
      } catch (e) {}
    }
    const query = formatSql(sql);
    pool.query(query, params || [], (err, res) => {
      if (err) return callback ? callback(err) : null;
      if (callback) callback(null, res.rows ? res.rows[0] : null);
    });
  },

  // Handles db.run(sql, params, callback) with this.lastID and this.changes support
  run: async (sql, params, callback) => {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    if (!process.env.DATABASE_URL) {
      const err = new Error(
        "DATABASE_URL is not set. Please configure DATABASE_URL in your Render Environment."
      );
      return callback ? callback(err) : null;
    }
    if (initPromise) {
      try {
        await initPromise;
      } catch (e) {}
    }
    let query = formatSql(sql);

    // If it's an INSERT statement without RETURNING, append RETURNING id so this.lastID works
    const isInsert = /^\s*insert\s+into/i.test(query);
    if (isInsert && !/returning/i.test(query)) {
      query += " RETURNING id";
    }

    pool.query(query, params || [], function (err, res) {
      if (err) return callback ? callback(err) : null;
      if (callback) {
        const lastId = res && res.rows && res.rows[0] ? res.rows[0].id : null;
        const context = {
          lastID: lastId,
          changes: res ? res.rowCount : 0,
        };
        callback.call(context, null);
      }
    });
  },

  // Handles db.serialize(callback)
  serialize: (fn) => {
    if (fn) fn();
  },
};

module.exports = db;