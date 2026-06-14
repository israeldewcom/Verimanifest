import { Worker } from 'bullmq';
import { ManifestService } from '../modules/manifest/manifest.service';
import { pdfService } from '../services/pdf.service';
import { emailService } from '../services/email.service';
import { notificationService } from '../services/notification.service';
import { blockchainVerification } from '../services/blockchain/merkleVerification';
import { complianceEngine } from '../services/complianceEngine';
import { dataWarehouse } from '../services/dataWarehouse';
import { webhookManager } from '../services/webhookManager';
import { locationService } from '../services/location.service';
import { syncService } from '../services/sync.service';
import { queueJobsGauge } from '../config/metrics';
import prisma from '../config/database';
import logger from '../config/logger';

// Use a plain connection object to avoid ioredis type conflicts with BullMQ
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const manifestService = new ManifestService();

new Worker(
  'manifest-processing',
  async (job) => {
    logger.info(`Processing manifest job: ${job.name}`, { jobId: job.id });
    queueJobsGauge.set({ queue: 'manifest-processing', status: 'processing' }, 1);
  },
  { connection: redisConnection }
);

new Worker(
  'pdf-generation',
  async (job) => {
    if (job.name === 'generate') {
      const { manifestId } = job.data;
      await pdfService.generateManifestPDF(manifestId);
      logger.info(`PDF generated for manifest ${manifestId}`);
    }
  },
  { connection: redisConnection }
);

new Worker(
  'notifications',
  async (job) => {
    if (job.name === 'notify-participant') {
      await notificationService.send(job.data.userId, job.data.type, job.data.data);
    }
  },
  { connection: redisConnection }
);

new Worker(
  'emails',
  async (job) => {
    if (job.name === 'send') {
      await emailService.send(job.data);
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

new Worker(
  'webhooks',
  async (job) => {
    if (job.name === 'deliver') {
      await webhookManager.sendWebhookDelivery(job.data);
    }
  },
  { connection: redisConnection, concurrency: 10 }
);

new Worker(
  'blockchain',
  async (job) => {
    if (job.name === 'anchor') {
      const manifest = await prisma.manifest.findUnique({
        where: { id: job.data.manifestId },
      });
      if (manifest) {
        await blockchainVerification.anchorManifestToBlockchain(
          manifest.manifestNumber,
          { id: manifest.id, status: manifest.status, createdAt: manifest.createdAt }
        );
      }
    }
  },
  { connection: redisConnection }
);

new Worker(
  'compliance',
  async (job) => {
    if (job.name === 'check') {
      await complianceEngine.validateManifest(job.data.manifestId);
    }
  },
  { connection: redisConnection }
);

new Worker(
  'data-warehouse',
  async () => {
    await dataWarehouse.syncToWarehouse();
  },
  { connection: redisConnection }
);

new Worker(
  'sms',
  async (job) => {
    if (job.name === 'send') {
      const { to, message } = job.data;
      if (process.env.TWILIO_ACCOUNT_SID) {
        const twilio = require('twilio')(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        await twilio.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to,
        });
      }
    }
  },
  { connection: redisConnection }
);

new Worker(
  'location-updates',
  async (job) => {
    logger.debug('Processing location update', { data: job.data });
  },
  { connection: redisConnection }
);

new Worker(
  'offline-sync',
  async (job) => {
    if (job.name === 'sync') {
      const { companyId, actions } = job.data;
      const results = await syncService.processBatch(companyId, actions);
      logger.info('Offline sync processed', { companyId, resultCount: results.length });
      return results;
    }
  },
  { connection: redisConnection }
);

logger.info('All queue workers started');

setInterval(async () => {
  try {
    const queues = [
      'manifest-processing', 'pdf-generation', 'notifications', 'emails',
      'webhooks', 'blockchain', 'compliance', 'data-warehouse', 'sms',
      'location-updates', 'offline-sync',
    ];
    for (const queueName of queues) {
      const { Queue } = require('bullmq');
      const queue = new Queue(queueName, { connection: redisConnection });
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);
      queueJobsGauge.set({ queue: queueName, status: 'waiting' }, waiting);
      queueJobsGauge.set({ queue: queueName, status: 'active' }, active);
      queueJobsGauge.set({ queue: queueName, status: 'completed' }, completed);
      queueJobsGauge.set({ queue: queueName, status: 'failed' }, failed);
      await queue.close();
    }
  } catch (error) {
    logger.error('Failed to update queue metrics', { error });
  }
}, 30000);
