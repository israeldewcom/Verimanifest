import schedule from 'node-schedule';
import prisma from '../config/database';
import { complianceEngine } from '../services/complianceEngine';
import { dataWarehouse } from '../services/dataWarehouse';
import { syntheticMonitor } from '../services/syntheticMonitor';
import { vaultService } from '../config/vault';
import { cacheService } from '../services/cache.service';
import logger from '../config/logger';

schedule.scheduleJob('0 2 * * *', async () => {
  logger.info('Running nightly compliance checks');
  try {
    const manifests = await prisma.manifest.findMany({
      where: {
        status: { notIn: ['archived', 'disposed'] },
      },
      select: { id: true },
    });

    const results = await complianceEngine.batchValidateManifests(
      manifests.map((m) => m.id)
    );
    logger.info('Nightly compliance checks completed', {
      totalChecked: Object.keys(results).length,
    });
  } catch (error) {
    logger.error('Nightly compliance checks failed', { error });
  }
});

schedule.scheduleJob('0 * * * *', async () => {
  logger.info('Starting data warehouse sync');
  try {
    await dataWarehouse.syncToWarehouse();
    logger.info('Data warehouse sync completed');
  } catch (error) {
    logger.error('Data warehouse sync failed', { error });
  }
});

schedule.scheduleJob('*/5 * * * *', async () => {
  await syntheticMonitor.runHealthCheck();
});

schedule.scheduleJob('0 3 * * *', async () => {
  logger.info('Cleaning expired refresh tokens');
  try {
    const result = await prisma.refreshToken.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        revoked: false,
      },
      data: { revoked: true },
    });
    logger.info(`Revoked ${result.count} expired refresh tokens`);
  } catch (error) {
    logger.error('Token cleanup failed', { error });
  }
});

schedule.scheduleJob('0 */12 * * *', async () => {
  logger.info('Rotating database credentials');
  try {
    await vaultService.rotateDatabaseCredentials();
  } catch (error) {
    logger.error('Credential rotation failed', { error });
  }
});

schedule.scheduleJob('*/30 * * * *', async () => {
  logger.info('Running cache cleanup');
  try {
    await cacheService.delPattern('blockchain:verify:*');
    logger.info('Cache cleanup completed');
  } catch (error) {
    logger.error('Cache cleanup failed', { error });
  }
});

schedule.scheduleJob('0 8 * * *', async () => {
  logger.info('Cleaning old driver location data (30 days)');
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.driverLocation.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });
    logger.info(`Deleted ${deleted.count} old driver location records`);
  } catch (error) {
    logger.error('Location cleanup failed', { error });
  }
});

logger.info('Scheduled jobs initialized');
