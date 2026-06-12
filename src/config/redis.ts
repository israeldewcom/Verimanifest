import Redis from 'ioredis';
import { environment } from './environment';
import logger from './logger';

let redis: Redis;

if (environment.REDIS_CLUSTER_URLS.length > 0) {
  redis = new Redis.Cluster(environment.REDIS_CLUSTER_URLS.map(url => new URL(url)), {
    redisOptions: {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis cluster retry attempt ${times}, delay ${delay}ms`);
        return delay;
      },
    },
  });
} else {
  redis = new Redis(environment.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis retry attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    lazyConnect: true,
  });
}

redis.on('connect', () => logger.info('Redis connected'));
redis.on('ready', () => logger.info('Redis ready'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('close', () => logger.warn('Redis connection closed'));
redis.on('reconnecting', () => logger.info('Redis reconnecting'));

export default redis;
