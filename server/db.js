const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: false }
    : false,
});

// Helper function to run queries
async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

module.exports = { pool, query };
