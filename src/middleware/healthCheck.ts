import { Request, Response } from 'express';
import prisma from '../config/database';
import redis from '../config/redis';
import { manifestQueue, emailQueue, webhookQueue } from '../config/queue';
import logger from '../config/logger';

export const healthCheck = async (req: Request, res: Response) => {
  const checks: any = {
    database: false,
    redis: false,
    queues: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (e) {
    logger.error('Database health check failed', { error: e });
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (e) {
    logger.error('Redis health check failed', { error: e });
  }

  try {
    const [manifestCount, emailCount, webhookCount] = await Promise.all([
      manifestQueue.getWaitingCount(),
      emailQueue.getWaitingCount(),
      webhookQueue.getWaitingCount(),
    ]);
    checks.queues = {
      manifest: { waiting: manifestCount },
      email: { waiting: emailCount },
      webhook: { waiting: webhookCount },
    };
  } catch (e) {
    logger.error('Queue health check failed', { error: e });
  }

  const healthy = checks.database && checks.redis;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
};

export const readinessCheck = async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready' });
  }
};

export const livenessCheck = (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
};
