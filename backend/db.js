const { Pool } = require("pg");

// Automatically connects to your Supabase DATABASE_URL from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase SSL connections
  },
});

// Test connection on launch
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Failed to connect to Supabase database:", err.message);
  } else {
    console.log("✅ Successfully connected to Supabase PostgreSQL database!");
    release();
  }
});

// Converts SQLite "?" placeholders to Postgres "$1, $2, $3"
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