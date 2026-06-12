import { Worker } from 'bullmq';
import redis from '../config/redis';
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

const manifestService = new ManifestService();

new Worker(
  'manifest-processing',
  async (job) => {
    logger.info(`Processing manifest job: ${job.name}`, { jobId: job.id });
    queueJobsGauge.set({ queue: 'manifest-processing', status: 'processing' }, 1);
  },
  { connection: redis }
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
  { connection: redis }
);

new Worker(
  'notifications',
  async (job) => {
    if (job.name === 'notify-participant') {
      await notificationService.send(job.data.userId, job.data.type, job.data.data);
    }
  },
  { connection: redis }
);

new Worker(
  'emails',
  async (job) => {
    if (job.name === 'send') {
      await emailService.send(job.data);
    }
  },
  { connection: redis, concurrency: 5 }
);

new Worker(
  'webhooks',
  async (job) => {
    if (job.name === 'deliver') {
      await webhookManager.sendWebhookDelivery(job.data);
    }
  },
  {
    connection: redis,
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    concurrency: 10,
  }
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
  { connection: redis }
);

new Worker(
  'compliance',
  async (job) => {
    if (job.name === 'check') {
      await complianceEngine.validateManifest(job.data.manifestId);
    }
  },
  { connection: redis }
);

new Worker(
  'data-warehouse',
  async (job) => {
    await dataWarehouse.syncToWarehouse();
  },
  { connection: redis }
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
  { connection: redis }
);

new Worker(
  'location-updates',
  async (job) => {
    // Process location update (geofencing, ETA calculation)
    logger.debug('Processing location update', { data: job.data });
  },
  { connection: redis }
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
  { connection: redis }
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
      const queue = new (require('bullmq').Queue)(queueName, { connection: redis });
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
