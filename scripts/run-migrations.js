const fs = require('fs');
const mysql = require('mysql2/promise');
try { require('dotenv').config(); } catch(e) {}

async function run() {
  const sql = fs.readFileSync(__dirname + '/../db/schema.sql', 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true
  });
  try {
    await conn.query(sql);
    console.log('✅ Migrations applied (db/schema.sql)');
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
  } finally {
    await conn.end();
  }
}

run();
