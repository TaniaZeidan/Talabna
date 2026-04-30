const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3307,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'mvd_app',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  multipleStatements: false,
  dateStrings: true,
});

// Verify connectivity on boot
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[db] Connected to MySQL');
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
  }
})();

module.exports = pool;
