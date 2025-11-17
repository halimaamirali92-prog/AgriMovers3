const mysql = require('mysql2/promise');
// dotenv is optional here; if not installed we'll continue and rely on environment variables
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed — that's fine for now
}

async function check() {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'agrimovers3',
    connectionLimit: 2
  };

  console.log('Testing MySQL connection with config:', { host: cfg.host, user: cfg.user, database: cfg.database });

  try {
    const pool = mysql.createPool(cfg);
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT VERSION() as ver');
    console.log('✅ Connected to MySQL server version:', rows[0].ver);
    conn.release();
    await pool.end();
  } catch (err) {
    console.error('❌ DB connection failed:', err.message || err);
    console.error('Tip: ensure MySQL is running, the database exists (run db/schema.sql), and `.env` has correct credentials.');
    process.exitCode = 1;
  }
}

check();
