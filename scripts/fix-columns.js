const mysql = require('mysql2/promise');
(async ()=>{
  try{ require('dotenv').config(); }catch(e){}
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'agrimovers3'
  });

  const alters = [
    `ALTER TABLE users ADD COLUMN vehicle_size VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN availability TINYINT(1) DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN lat DOUBLE DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN lng DOUBLE DEFAULT NULL`,

    `ALTER TABLE transport_requests ADD COLUMN transporter_name VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN transporter_id INT DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN distance_km DECIMAL(8,2) DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN agreed_price DECIMAL(10,2) DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN status_en_route_at TIMESTAMP NULL DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN status_picked_at TIMESTAMP NULL DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN status_delivered_at TIMESTAMP NULL DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN current_lat DOUBLE DEFAULT NULL`,
    `ALTER TABLE transport_requests ADD COLUMN current_lng DOUBLE DEFAULT NULL`
  ];

  for (const q of alters) {
    try {
      await conn.query(q);
      console.log('OK:', q);
    } catch (err) {
      console.log('Skipped/Failed:', q, '->', err.message);
    }
  }

  await conn.end();
  console.log('Done');
})();