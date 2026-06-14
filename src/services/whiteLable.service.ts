import prisma from '../config/database';
import { cacheService } from './cache.service';
import { environment } from '../config/environment';

export class WhiteLabelService {
  async getConfig(companyId: string) {
    const cacheKey = cacheService.generateKey('whiteLabel', companyId);
    return cacheService.getOrSet(cacheKey, async () => {
      let config = await prisma.whiteLabelConfig.findUnique({ where: { companyId } });
      if (!config) {
        config = await prisma.whiteLabelConfig.create({
          data: {
            companyId,
            companyName: (await prisma.company.findUnique({ where: { id: companyId } }))?.name || 'VeriManifest',
            logo: environment.WHITE_LABEL_DEFAULT_LOGO_URL,
            primaryColor: environment.WHITE_LABEL_DEFAULT_PRIMARY_COLOR,
            secondaryColor: '#4A5568',
            customDomain: null,
            emailTemplates: {},
          },
        });
      }
      return config;
    }, 86400);
  }

  async updateConfig(companyId: string, data: any) {
    const config = await prisma.whiteLabelConfig.update({
      where: { companyId },
      data: {
        companyName: data.companyName,
        logo: data.logo,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        customDomain: data.customDomain,
        emailTemplates: data.emailTemplates,
      },
    });
    await cacheService.del(cacheService.generateKey('whiteLabel', companyId));
    return config;
  }

  async getCompanyByDomain(domain: string) {
    if (!domain) return null;
    const company = await prisma.company.findFirst({
      where: { whiteLabel: { customDomain: domain } },
      include: { whiteLabel: true },
    });
    return company;
  }
}

export const whiteLabelService = new WhiteLabelService();
