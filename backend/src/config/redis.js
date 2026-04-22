const { createClient } = require('redis');
const logger = require('../utils/logger');

const client = createClient({
  url: process.env.REDIS_URL,
});

client.on('error', (err) => logger.error('Redis error', err));
client.on('connect', () => logger.info('Redis connected'));

const connect = async () => {
  await client.connect();
};

const set = async (key, value, ttlSeconds) => {
  const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
  if (ttlSeconds) {
    await client.setEx(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
};

const get = async (key) => {
  const value = await client.get(key);
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
};

const del = async (key) => client.del(key);

const exists = async (key) => client.exists(key);

module.exports = { connect, set, get, del, exists, client };
