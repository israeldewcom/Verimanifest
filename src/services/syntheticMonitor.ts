import prisma from '../config/database';
import redis from '../config/redis';
import { manifestQueue } from '../config/queue';
import { s3Client } from '../config/aws';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import logger from '../config/logger';

class SyntheticMonitor {
  async runHealthCheck() {
    const results: any = {
      timestamp: new Date().toISOString(),
      checks: {},
    };

    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      results.checks.database = { success: true, latency: Date.now() - start };
    } catch (error: any) {
      results.checks.database = { success: false, error: error.message };
    }

    try {
      const start = Date.now();
      await redis.ping();
      results.checks.redis = { success: true, latency: Date.now() - start };
    } catch (error: any) {
      results.checks.redis = { success: false, error: error.message };
    }

    try {
      const start = Date.now();
      await s3Client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET! }));
      results.checks.s3 = { success: true, latency: Date.now() - start };
    } catch (error: any) {
      results.checks.s3 = { success: false, error: error.message };
    }

    try {
      const start = Date.now();
      const jobCount = await manifestQueue.getWaitingCount();
      results.checks.queue = { 
        success: true, 
        latency: Date.now() - start,
        waitingJobs: jobCount,
      };
    } catch (error: any) {
      results.checks.queue = { success: false, error: error.message };
    }

    await prisma.healthCheckResult.create({
      data: {
        passed: Object.values(results.checks).every((c: any) => c.success),
        results,
        timestamp: new Date(),
      },
    });

    const allPassed = Object.values(results.checks).every((c: any) => c.success);
    if (!allPassed) {
      logger.error('Synthetic health check failed', results);
    }

    return results;
  }

  async runCriticalPathTest() {
    logger.info('Running critical path test');
    
    try {
      const manifest = await prisma.manifest.create({
        data: {
          manifestNumber: `SYNTH-${Date.now()}`,
          status: 'draft',
          wasteType: 'Test Waste',
          wasteClassification: 'non-hazardous',
          quantity: 1,
          unit: 'pounds',
          containerType: 'Box',
          containerCount: 1,
          generatorId: '00000000-0000-0000-0000-000000000001',
          transporterId: '00000000-0000-0000-0000-000000000001',
          facilityId: '00000000-0000-0000-0000-000000000001',
          companyId: '00000000-0000-0000-0000-000000000001',
          createdBy: 'system',
        },
      });

      await prisma.manifest.update({
        where: { id: manifest.id },
        data: { status: 'generator_signed' },
      });

      await prisma.manifest.delete({ where: { id: manifest.id } });

      logger.info('Critical path test passed');
      return { success: true };
    } catch (error: any) {
      logger.error('Critical path test failed', { error });
      return { success: false, error: error.message };
    }
  }
}

export const syntheticMonitor = new SyntheticMonitor();
