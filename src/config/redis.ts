import Redis from 'ioredis';
import { environment } from './environment';
import logger from './logger';

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis retry attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  lazyConnect: true,
};

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisOptions)
  : new Redis({
      host: environment.REDIS_HOST,
      port: parseInt(environment.REDIS_PORT, 10),
      ...redisOptions,
    });

redis.on('connect', () => logger.info('Redis connected'));
redis.on('ready', () => logger.info('Redis ready'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('close', () => logger.warn('Redis connection closed'));
redis.on('reconnecting', () => logger.info('Redis reconnecting'));

export default redis;
