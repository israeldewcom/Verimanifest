import { Queue, Worker, QueueEvents } from 'bullmq';
import { environment } from './environment';
import logger from './logger';

function parseRedisConnection() {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
    };
  }
  return {
    host: environment.REDIS_HOST,
    port: parseInt(environment.REDIS_PORT, 10),
  };
}

const redisConnection = parseRedisConnection();
