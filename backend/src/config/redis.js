const logger = require('../utils/logger');

// Extract just the redis:// URL — handles case where someone pastes the full CLI command
const rawUrl = (process.env.REDIS_URL || '');
const match = rawUrl.match(/(rediss?:\/\/\S+)/);
const redisUrl = match ? match[1] : (rawUrl.startsWith('redis') ? rawUrl : null);

let client = null;

if (redisUrl) {
  try {
    const { createClient } = require('redis');
    client = createClient({ url: redisUrl });
    client.on('error', (err) => logger.warn('Redis error: ' + err.message));
    client.on('connect', () => logger.info('Redis connected'));
  } catch (e) {
    logger.warn('Redis client init failed: ' + e.message);
    client = null;
  }
}

const connect = async () => {
  if (!client) { logger.warn('Redis not configured — running without cache'); return; }
  try { await client.connect(); }
  catch (e) { logger.warn('Redis connect failed: ' + e.message); client = null; }
};

const set = async (key, value, ttlSeconds) => {
  if (!client) return;
  try {
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (ttlSeconds) { await client.setEx(key, ttlSeconds, s); }
    else { await client.set(key, s); }
  } catch (e) { /* skip */ }
};

const get = async (key) => {
  if (!client) return null;
  try {
    const value = await client.get(key);
    if (!value) return null;
    try { return JSON.parse(value); } catch { return value; }
  } catch (e) { return null; }
};

const del = async (key) => { if (!client) return null; try { return client.del(key); } catch { return null; } };
const exists = async (key) => { if (!client) return false; try { return client.exists(key); } catch { return false; } };

module.exports = { connect, set, get, del, exists, client };
