import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from '../config/redis';
import { environment } from '../config/environment';
import { Request } from 'express';
import { cacheService } from '../services/cache.service';
import prisma from '../config/database';

async function getMaxForCompany(companyId: string): Promise<number> {
  const cacheKey = cacheService.generateKey('company', companyId, 'rateLimit');
  let plan = await cacheService.get<string>(cacheKey);
  if (!plan) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { subscriptionStatus: true },
    });
    plan = company?.subscriptionStatus || 'free';
    await cacheService.set(cacheKey, plan, 600);
  }
  
  switch (plan) {
    case 'free': return environment.RATE_LIMIT_MAX_FREE;
    case 'starter': return environment.RATE_LIMIT_MAX_STARTER;
    case 'professional': return environment.RATE_LIMIT_MAX_PROFESSIONAL;
    case 'enterprise': return environment.RATE_LIMIT_MAX_ENTERPRISE;
    default: return environment.RATE_LIMIT_MAX_FREE;
  }
}

export const rateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as any,
  }),
  windowMs: environment.RATE_LIMIT_WINDOW_MS,
  max: async (req: Request) => {
    const companyId = (req as any).user?.companyId;
    if (!companyId) return environment.RATE_LIMIT_MAX_FREE;
    return getMaxForCompany(companyId);
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
  keyGenerator: (req) => {
    return (req as any).user?.companyId || req.ip || 'unknown';
  },
});

export const perUserRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as any,
  }),
  windowMs: environment.RATE_LIMIT_WINDOW_MS,
  max: 100, // per user default
  keyGenerator: (req) => (req as any).user?.userId || req.ip || 'unknown',
  message: { success: false, message: 'User rate limit exceeded.' },
});

export const authLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as any,
  }),
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many authentication attempts.' },
  skipSuccessfulRequests: true,
});

export const webhookLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as any,
  }),
  windowMs: 60 * 1000,
  max: 500,
  message: { success: false, message: 'Webhook rate limit exceeded.' },
});
