import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import http from 'http';
import responseTime from 'response-time';
import { environment } from './config/environment';
import logger from './config/logger';
import { register, httpRequestDurationMicroseconds } from './config/metrics';
import { rateLimiter, perUserRateLimiter, authLimiter } from './middleware/rateLimiter';
import { authenticate, requirePermission } from './middleware/auth';
import { authenticateApiKey } from './middleware/apiKeyAuth';
import { healthCheck, readinessCheck, livenessCheck } from './middleware/healthCheck';
import { errorHandler } from './middleware/errorHandler';
import { initializeWebSocket } from './websocket/socket.service';

import authRoutes from './modules/auth/auth.routes';
import manifestRoutes from './modules/manifest/manifest.routes';
import billingRoutes from './modules/billing/billing.routes';
import marketplaceRoutes from './modules/marketplace/marketplace.routes';
import webhookRoutes from './modules/webhook/webhook.routes';
import apiKeyRoutes from './modules/apiKey/apiKey.routes';

import './workers/queue.workers';
import './workers/scheduler.workers';
import './workers/syntheticMonitor.worker';

import { featureFlags } from './config/featureFlags';
import { whiteLabelService } from './services/whiteLabel.service';
import { cacheService } from './services/cache.service';

const vaultService = {
  async initialize() { logger.info('Vault mock initialized'); },
  async rotateDatabaseCredentials() { logger.info('Vault mock: credential rotation skipped'); }
};

const app = express();
const server = http.createServer(app);

initializeWebSocket(server);

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
if (environment.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  logger.warn('ALLOWED_ORIGINS not set in production, CORS will be restrictive');
}
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || environment.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());

app.use('/api/v1/billing/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(
  responseTime((req: any, res: any, time: number) => {
    if (req.path && !req.path.startsWith('/metrics') && !req.path.startsWith('/health')) {
      const route = req.route?.path || req.path;
      httpRequestDurationMicroseconds
        .labels(req.method, route, res.statusCode.toString())
        .observe(time / 1000);
    }
  })
);

app.use(async (req, res, next) => {
  const host = req.hostname;
  let company = await whiteLabelService.getCompanyByDomain(host);
  if (!company && environment.NODE_ENV !== 'production') {
    const prisma = (await import('./config/database')).default;
    company = await prisma.company.findFirst({ where: { whiteLabel: { customDomain: null } } });
  }
  if (company) {
    const config = await whiteLabelService.getConfig(company.id);
    res.locals.whiteLabel = config;
  }
  next();
});

app.get('/health', healthCheck);
app.get('/health/ready', readinessCheck);
app.get('/health/live', livenessCheck);
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/', rateLimiter);

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/manifests', authenticate, perUserRateLimiter, manifestRoutes);
app.use('/api/v1/marketplace', authenticate, perUserRateLimiter, marketplaceRoutes);
app.use('/api/v1/api-keys', authenticate, requirePermission('manage:api'), apiKeyRoutes);

app.post('/api/v1/sync', authenticateApiKey, async (req, res, next) => {
  try {
    const { syncService } = await import('./services/sync.service');
    const { actions } = req.body;
    const companyId = (req as any).apiKeyInfo.companyId;
    const results = await syncService.processBatch(companyId, actions);
    res.json({ success: true, results });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/location', authenticateApiKey, async (req, res, next) => {
  try {
    const { locationService } = await import('./services/location.service');
    const { driverId, manifestId, lat, lng, accuracy } = req.body;
    await locationService.updateLocation({
      driverId,
      manifestId,
      lat,
      lng,
      accuracy,
      timestamp: new Date(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/drivers/:driverId/location', authenticateApiKey, async (req, res, next) => {
  try {
    const { locationService } = await import('./services/location.service');
    const location = await locationService.getLatestLocation(req.params.driverId);
    res.json({ success: true, data: location });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/user/data', authenticate, async (req: any, res, next) => {
  try {
    const { gdprService } = await import('./services/gdpr.service');
    const data = await gdprService.exportUserData(req.user.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/v1/user/data', authenticate, async (req: any, res, next) => {
  try {
    const { gdprService } = await import('./services/gdpr.service');
    await gdprService.deleteUserData(req.user.userId);
    res.json({ success: true, message: 'Data deletion requested' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/white-label', async (req, res, next) => {
  try {
    const config = res.locals.whiteLabel || {
      companyName: 'VeriManifest',
      logo: environment.WHITE_LABEL_DEFAULT_LOGO_URL,
      primaryColor: environment.WHITE_LABEL_DEFAULT_PRIMARY_COLOR,
      secondaryColor: '#4A5568',
    };
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
});

// **FIXED COMPANY ROUTE – cast to any to avoid TypeScript error**
app.get('/api/v1/company', authenticate, async (req: any, res, next) => {
  try {
    const prisma = (await import('./config/database')).default;
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      include: { whiteLabel: true },
    });
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, data: company as any });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/v1/company', authenticate, requirePermission('write:company'), async (req: any, res, next) => {
  try {
    const prisma = (await import('./config/database')).default;
    const company = await prisma.company.update({
      where: { id: req.user.companyId },
      data: req.body,
    });
    await cacheService.del(cacheService.generateKey('company', req.user.companyId));
    res.json({ success: true, data: company });
  } catch (error) {
    next(error);
  }
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

async function initializeServices() {
  try {
    await vaultService.initialize();
    await featureFlags.initialize();
    logger.info('All services initialized');
  } catch (error) {
    logger.error('Service initialization failed', { error });
    process.exit(1);
  }
}

server.listen(environment.PORT, async () => {
  await initializeServices();
  logger.info(`🚀 VeriManifest API running on port ${environment.PORT}`);
  logger.info(`📊 Environment: ${environment.NODE_ENV}`);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    (async () => {
      const prisma = (await import('./config/database')).default;
      await prisma.$disconnect();
      logger.info('Server shut down complete');
      process.exit(0);
    })();
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    (async () => {
      const prisma = (await import('./config/database')).default;
      await prisma.$disconnect();
      process.exit(0);
    })();
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

export default app;
