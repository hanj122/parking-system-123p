try {
  require("dotenv").config();
} catch (e) {}

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

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
    console.warn(
      "\n========================================================================",
    );
    console.warn("⚠️  DATABASE_URL environment variable is NOT SET!");
    console.warn("   If running on Render:");
    console.warn(
      "   1. Open Render Dashboard -> Your Web Service -> Environment",
    );
    console.warn(
      "   2. Add Key: DATABASE_URL, Value: your Supabase / PostgreSQL URI",
    );
    console.warn(
      "========================================================================\n",
    );
    return;
  }

  let client;
  try {
    client = await pool.connect();
    console.log("✅ Successfully connected to Supabase PostgreSQL database!");

    // 1. Provision compatibility functions
    try {
      await client.query(COMPAT_SQL);
    } catch (compatErr) {
      // Functions already created or concurrent execution
    }

    // 2. Provision database schema & migrations
    try {
      await client.query(`
        ALTER TABLE IF EXISTS demand_forecasts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
        ALTER TABLE IF EXISTS demand_forecasts ADD COLUMN IF NOT EXISTS external_id TEXT;
        ALTER TABLE IF EXISTS demand_forecasts ADD COLUMN IF NOT EXISTS latitude REAL;
        ALTER TABLE IF EXISTS demand_forecasts ADD COLUMN IF NOT EXISTS longitude REAL;
        ALTER TABLE IF EXISTS demand_forecasts ADD COLUMN IF NOT EXISTS location TEXT;
      `);
    } catch (migErr) {
      console.warn("Notice during column migrations:", migErr.message);
    }

    const schemaPath = path.join(__dirname, "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, "utf8");
      await client.query(schemaSql);
      console.log(
        "✅ Database schema verified (slots, tickets, reports, forecasts).",
      );
    }

    // 3. Ensure slots table has 300 spaces
    const slotsRes = await client.query("SELECT COUNT(*) AS count FROM slots;");
    const slotCount = parseInt(slotsRes.rows[0].count, 10);
    if (slotCount === 0) {
      console.log(
        "🌱 Slots table is empty. Initializing 300 parking spaces...",
      );
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
          [i, floor, isMc ? "motorcycle" : null, isMc ? 6 : 1],
        );
      }
      console.log(
        "✅ 300 slots initialized (Slots 100-119 reserved for motorcycles, capacity 6).",
      );
    }

    // 4. Ensure tickets table has data
    const ticketsRes = await client.query(
      "SELECT COUNT(*) AS count FROM tickets;",
    );
    const ticketCount = parseInt(ticketsRes.rows[0].count, 10);
    if (ticketCount === 0) {
      console.log(
        "🌱 Tickets table is empty. Auto-seeding synthetic operational data...",
      );
      try {
        const { seedDataset } = require("../data/seed-supabase");
        await seedDataset(client, { clearExisting: false });
        console.log(
          "✅ Database auto-seeded with 30-day realistic telemetry data!",
        );
      } catch (seedErr) {
        console.error("⚠️ Auto-seeding notice:", seedErr.message);
      }
    } else {
      console.log(
        `ℹ️ Operational data ready: ${ticketCount} tickets, ${slotCount || 300} slots.`,
      );
    }

    // 5. Ensure lot_location default row is seeded
    try {
      const lotRes = await client.query(
        "SELECT COUNT(*) AS count FROM lot_location;",
      );
      if (lotRes.rows[0].count === "0" || lotRes.rows[0].count === 0) {
        await client.query(
          "INSERT INTO lot_location (id, latitude, longitude, radius_km) VALUES (1, 14.5995, 120.9842, 3.0) ON CONFLICT (id) DO NOTHING;",
        );
      }
    } catch (lotErr) {
      // ignore
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
// and translates SQLite idioms (e.g. INSERT OR IGNORE) to PostgreSQL ON CONFLICT DO NOTHING
function formatSql(sql) {
  let transformed = sql;
  if (/^\s*insert\s+or\s+ignore\s+into/i.test(transformed)) {
    transformed = transformed.replace(
      /^\s*insert\s+or\s+ignore\s+into/i,
      "INSERT INTO",
    );
    if (!/on\s+conflict/i.test(transformed)) {
      transformed += " ON CONFLICT DO NOTHING";
    }
  }
  let index = 1;
  return transformed.replace(/\?/g, () => `$${index++}`);
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
        "DATABASE_URL is not set. Please configure DATABASE_URL in your Render Environment.",
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
        "DATABASE_URL is not set. Please configure DATABASE_URL in your Render Environment.",
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
        "DATABASE_URL is not set. Please configure DATABASE_URL in your Render Environment.",
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
  pool,
  initDatabase,
};

module.exports = db;
