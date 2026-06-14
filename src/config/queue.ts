import { Queue, Worker, QueueEvents } from 'bullmq';
import { environment } from './environment';
import logger from './logger';

const redisConnection = {
  host: environment.REDIS_HOST,
  port: parseInt(environment.REDIS_PORT, 10),
};

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
