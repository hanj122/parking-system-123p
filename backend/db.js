const { Pool } = require("pg");

// Automatically connects to your Supabase DATABASE_URL from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase SSL connections
  },
});

const COMPAT_SQL = `
CREATE OR REPLACE FUNCTION date(val text) RETURNS date AS $$
BEGIN
  RETURN SUBSTRING(val FROM 1 FOR 10)::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(val text, modifier text) RETURNS text AS $$
BEGIN
  IF modifier LIKE '-%day%' THEN
    RETURN TO_CHAR((SUBSTRING(val FROM 1 FOR 10)::date - INTERVAL '1 day'), 'YYYY-MM-DD');
  ELSE
    RETURN SUBSTRING(val FROM 1 FOR 10);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(val text, modifier text, tz text) RETURNS text AS $$
BEGIN
  IF val = 'now' AND modifier LIKE '-%day%' THEN
    RETURN TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila' - INTERVAL '1 day'), 'YYYY-MM-DD');
  ELSIF val = 'now' THEN
    RETURN TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD');
  ELSE
    RETURN SUBSTRING(val FROM 1 FOR 10);
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

// Test connection and provision compatibility functions on launch
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Failed to connect to Supabase database:", err.message);
  } else {
    console.log("✅ Successfully connected to Supabase PostgreSQL database!");
    client.query(COMPAT_SQL, (compatErr) => {
      release();
      if (compatErr) {
        console.warn("Notice on compatibility functions:", compatErr.message);
      }
    });
  }
});

// Converts standard "?" positional placeholders to PostgreSQL "$1, $2, $3"
function formatSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const db = {
  // Handles db.all(sql, params, callback)
  all: (sql, params, callback) => {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    const query = formatSql(sql);
    pool.query(query, params || [], (err, res) => {
      if (err) return callback ? callback(err) : null;
      if (callback) callback(null, res.rows);
    });
  },

  // Handles db.get(sql, params, callback)
  get: (sql, params, callback) => {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    const query = formatSql(sql);
    pool.query(query, params || [], (err, res) => {
      if (err) return callback ? callback(err) : null;
      if (callback) callback(null, res.rows ? res.rows[0] : null);
    });
  },

  // Handles db.run(sql, params, callback) with this.lastID and this.changes support
  run: (sql, params, callback) => {
    if (typeof params === "function") {
      callback = params;
      params = [];
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