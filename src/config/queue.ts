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

export const manifestQueue = new Queue('manifest-processing', { connection: redisConnection });
export const pdfGenerationQueue = new Queue('pdf-generation', { connection: redisConnection });
export const notificationQueue = new Queue('notifications', { connection: redisConnection });
export const emailQueue = new Queue('emails', { connection: redisConnection });
export const webhookQueue = new Queue('webhooks', { connection: redisConnection });
export const blockchainQueue = new Queue('blockchain', { connection: redisConnection });
export const complianceQueue = new Queue('compliance', { connection: redisConnection });
export const dataWarehouseQueue = new Queue('data-warehouse', { connection: redisConnection });
export const smsQueue = new Queue('sms', { connection: redisConnection });
export const pushNotificationQueue = new Queue('push-notifications', { connection: redisConnection });
export const locationQueue = new Queue('location-updates', { connection: redisConnection });
export const syncQueue = new Queue('offline-sync', { connection: redisConnection });

// Optional: queue events for monitoring
const queues = [manifestQueue, pdfGenerationQueue, notificationQueue, emailQueue, webhookQueue, blockchainQueue, complianceQueue, dataWarehouseQueue, smsQueue, pushNotificationQueue, locationQueue, syncQueue];
queues.forEach(queue => {
  const events = new QueueEvents(queue.name, { connection: redisConnection });
  events.on('error', (error) => logger.error(`Queue events error for ${queue.name}`, error));
});

logger.info('All queues initialized');
