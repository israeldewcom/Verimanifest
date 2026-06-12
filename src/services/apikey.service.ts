import crypto from 'crypto';
import prisma from '../config/database';
import { cacheService } from './cache.service';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';

class ApiKeyService {
  async generateApiKey(companyId: string, name: string, permissions: string[]) {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const secret = crypto.randomBytes(32).toString('hex');

    const key = await prisma.aPIKey.create({
      data: {
        companyId,
        name,
        apiKey,
        secret,
        permissions,
        isActive: true,
      },
    });

    // Return secret only once
    return { id: key.id, name: key.name, apiKey, secret, permissions: key.permissions };
  }

  async validateApiKey(apiKey: string, secret: string): Promise<{ companyId: string; permissions: string[] } | null> {
    const cacheKey = cacheService.generateKey('apiKey', apiKey);
    let keyData = await cacheService.get<any>(cacheKey);
    if (!keyData) {
      const key = await prisma.aPIKey.findUnique({
        where: { apiKey, isActive: true },
        select: { id: true, companyId: true, secret: true, permissions: true, lastUsedAt: true },
      });
      if (!key) return null;
      // Timing-safe comparison for secret
      if (!crypto.timingSafeEqual(Buffer.from(key.secret), Buffer.from(secret))) return null;
      keyData = { companyId: key.companyId, permissions: key.permissions };
      await cacheService.set(cacheKey, keyData, 300);
      // Update lastUsedAt asynchronously
      prisma.aPIKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }
    return keyData;
  }

  async revokeApiKey(companyId: string, keyId: string) {
    const key = await prisma.aPIKey.findFirst({ where: { id: keyId, companyId } });
    if (!key) throw AppError.notFound('API key not found');
    await prisma.aPIKey.update({ where: { id: keyId }, data: { isActive: false } });
    await cacheService.del(cacheService.generateKey('apiKey', key.apiKey));
  }

  async listApiKeys(companyId: string) {
    return prisma.aPIKey.findMany({
      where: { companyId },
      select: { id: true, name: true, apiKey: true, permissions: true, isActive: true, lastUsedAt: true, createdAt: true },
    });
  }
}

export const apiKeyService = new ApiKeyService();
