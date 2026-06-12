import { Queue, Worker, QueueScheduler } from 'bullmq';
import redis from './redis';
import logger from './logger';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 3600 * 24,
    count: 1000,
  },
  removeOnFail: {
    age: 3600 * 24 * 7,
  },
};

export const manifestQueue = new Queue('manifest-processing', { 
  connection: redis,
  defaultJobOptions,
});

export const pdfGenerationQueue = new Queue('pdf-generation', { 
  connection: redis,
  defaultJobOptions,
});

export const notificationQueue = new Queue('notifications', { 
  connection: redis,
  defaultJobOptions,
});

export const emailQueue = new Queue('emails', { 
  connection: redis,
  defaultJobOptions,
});

export const webhookQueue = new Queue('webhooks', { 
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
  },
});

export const blockchainQueue = new Queue('blockchain', { 
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export const complianceQueue = new Queue('compliance', { 
  connection: redis,
  defaultJobOptions,
});

export const dataWarehouseQueue = new Queue('data-warehouse', { 
  connection: redis,
  defaultJobOptions,
});

export const smsQueue = new Queue('sms', { 
  connection: redis,
  defaultJobOptions,
});

export const pushNotificationQueue = new Queue('push-notifications', { 
  connection: redis,
  defaultJobOptions,
});

export const locationQueue = new Queue('location-updates', {
  connection: redis,
  defaultJobOptions,
});

export const syncQueue = new Queue('offline-sync', {
  connection: redis,
  defaultJobOptions,
});

// Schedulers for delayed jobs
const queues = [
  manifestQueue, pdfGenerationQueue, notificationQueue, emailQueue,
  webhookQueue, blockchainQueue, complianceQueue, dataWarehouseQueue,
  smsQueue, pushNotificationQueue, locationQueue, syncQueue,
];

queues.forEach(queue => {
  new QueueScheduler(queue.name, { connection: redis });
});

logger.info('All queues and schedulers initialized');
