import prisma from '../config/database';
import { cacheService } from './cache.service';
import logger from '../config/logger';
import { AppError } from '../utils/AppError';

class InsuranceVerification {
  async blockDispatchWithoutInsurance(transporterId: string): Promise<boolean> {
    const cacheKey = cacheService.generateKey('insurance', transporterId);
    
    const cached = await cacheService.get<boolean>(cacheKey);
    if (cached !== null) return cached;

    const policies = await prisma.insurancePolicy.findMany({
      where: {
        companyId: transporterId,
        status: 'active',
        expirationDate: { gte: new Date() },
        effectiveDate: { lte: new Date() },
      },
    });

    const hasValidInsurance = policies.length > 0;
    await cacheService.set(cacheKey, hasValidInsurance, 1800);

    if (!hasValidInsurance) {
      logger.warn('Transporter lacks valid insurance', { transporterId });
    }

    return hasValidInsurance;
  }

  async verifyInsurance(policyId: string, verifiedBy: string): Promise<void> {
    await prisma.insurancePolicy.update({
      where: { id: policyId },
      data: {
        verifiedAt: new Date(),
        verifiedBy,
        status: 'verified',
      },
    });

    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: policyId },
      select: { companyId: true },
    });

    if (policy) {
      await cacheService.del(cacheService.generateKey('insurance', policy.companyId));
    }

    logger.info('Insurance policy verified', { policyId, verifiedBy });
  }

  async getInsuranceStatus(companyId: string) {
    const policies = await prisma.insurancePolicy.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    const activePolicy = policies.find(
      p => p.status === 'active' && p.expirationDate > new Date()
    );

    return {
      hasActiveInsurance: !!activePolicy,
      policies,
      activePolicy,
    };
  }
}

export const insuranceVerification = new InsuranceVerification();
