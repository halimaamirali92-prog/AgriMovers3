const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
// dotenv is optional here; if not installed we'll continue and rely on environment variables
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed — that's fine for now
}

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'agrimovers3',
    connectionLimit: 5
  });

  const conn = await pool.getConnection();
  try {
    // create demo users
    const pwd = await bcrypt.hash('password123', 10);
    await conn.query(`INSERT IGNORE INTO users (id, fullname, email, password, role) VALUES
      (1, 'Admin User', 'admin@agrimovers.test', ?, 'admin'),
      (2, 'Farmer One', 'farmer@agrimovers.test', ?, 'farmer'),
      (3, 'Transporter Joe', 'transporter@agrimovers.test', ?, 'transporter')
    `, [pwd, pwd, pwd]);

    // create sample transport requests
    await conn.query(`INSERT IGNORE INTO transport_requests (id, farmer_id, farmer_name, produce, quantity, pickup_time, pickup_location, destination, vehicleType, status, paid)
      VALUES
      (1, 2, 'Farmer One', 'Maize', '2 tons', '2025-11-10 08:00', 'Village A', 'Market Centre', 'Small Truck', 'Pending', 0),
      (2, 2, 'Farmer One', 'Beans', '500 kg', '2025-11-12 09:00', 'Village B', 'Local Depot', 'Pickup', 'Pending', 0)
    `);

    console.log('✅ Seed completed (users and sample requests).');
  } catch (err) {
    console.error('❌ Seed failed:', err.message || err);
  } finally {
    conn.release();
    pool.end();
  }
}

run();
