const mysql = require('mysql2/promise');
(async ()=>{
  try{
    require('dotenv').config();
  }catch(e){}
  try{
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'agrimovers3'
    });
    const [u] = await conn.query("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='vehicle_size'");
    const [t] = await conn.query("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transport_requests' AND COLUMN_NAME='current_lat'");
    console.log('vehicle_size exists:', u[0].cnt>0);
    console.log('current_lat exists:', t[0].cnt>0);
    await conn.end();
  }catch(err){
    console.error('check failed:', err.message || err);
    process.exit(1);
  }
})();