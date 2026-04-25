const logger = require('../utils/logger');

// Dummy no-op client used when Redis is unavailable
const noop = async () => null;
const noopFalse = async () => false;

let redisEnabled = false;
let redisClient = null;

const connect = async () => {
  const url = (process.env.REDIS_URL || '').trim();
  if (!url || url === 'redis://localhost:6379') {
    logger.warn('Redis not configured — running without cache');
    return;
  }

  // Extract just the redis:// or rediss:// URL if someone pasted a CLI command
  const match = url.match(/(rediss?:\/\/\S+)/);
  const cleanUrl = match ? match[1] : url;

  try {
    const { createClient } = require('redis');
    redisClient = createClient({
      url: cleanUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis: max retries reached, disabling cache');
            redisEnabled = false;
            return false; // stop reconnecting
          }
          return Math.min(retries * 500, 2000);
        }
      }
    });
    redisClient.on('error', (err) => logger.warn('Redis error: ' + err.message));
    redisClient.on('connect', () => { redisEnabled = true; logger.info('Redis connected'); });
    redisClient.on('end', () => { redisEnabled = false; });
    await redisClient.connect();
  } catch (e) {
    logger.warn('Redis unavailable: ' + e.message);
    redisEnabled = false;
    redisClient = null;
  }
};

const set = async (key, value, ttlSeconds) => {
  if (!redisEnabled || !redisClient) return;
  try {
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (ttlSeconds) { await redisClient.setEx(key, ttlSeconds, s); }
    else { await redisClient.set(key, s); }
  } catch { /* skip */ }
};

const get = async (key) => {
  if (!redisEnabled || !redisClient) return null;
  try {
    const value = await redisClient.get(key);
    if (!value) return null;
    try { return JSON.parse(value); } catch { return value; }
  } catch { return null; }
};

const del = async (key) => {
  if (!redisEnabled || !redisClient) return null;
  try { return redisClient.del(key); } catch { return null; }
};

const exists = async (key) => {
  if (!redisEnabled || !redisClient) return false;
  try { return redisClient.exists(key); } catch { return false; }
};

module.exports = { connect, set, get, del, exists };
