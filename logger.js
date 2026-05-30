const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => logger.error('Database pool error: ' + err.message));

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) logger.warn(`Slow query (${duration}ms): ${text.slice(0, 100)}`);
    return res;
  } catch (err) {
    logger.error('Query error: ' + err.message + ' | SQL: ' + text.slice(0, 100));
    throw err;
  }
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
