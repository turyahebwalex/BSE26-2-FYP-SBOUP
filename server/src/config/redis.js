const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
    redisClient.on('connect', () => logger.info('Redis Connected'));

    await redisClient.connect();
  } catch (error) {
    logger.warn(`Redis Connection Failed: ${error.message}. Continuing without cache.`);
  }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
