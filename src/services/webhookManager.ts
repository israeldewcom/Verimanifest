import prisma from '../config/database';
import { webhookQueue } from '../config/queue';
import { cacheService } from './cache.service';
import logger from '../config/logger';
import crypto from 'crypto';
import axios from 'axios';

class WebhookManager {
  async registerWebhook(companyId: string, url: string, events: string[]) {
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        companyId,
        url,
        events,
        secret,
        isActive: true,
      },
    });

    await cacheService.del(cacheService.generateKey('webhooks', companyId));

    return webhook;
  }

  async updateWebhook(webhookId: string, data: any) {
    const webhook = await prisma.webhook.update({
      where: { id: webhookId },
      data,
    });

    await cacheService.del(cacheService.generateKey('webhooks', webhook.companyId));

    return webhook;
  }

  async deleteWebhook(webhookId: string) {
    const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) return;

    await prisma.webhook.update({
      where: { id: webhookId },
      data: { isActive: false },
    });

    await cacheService.del(cacheService.generateKey('webhooks', webhook.companyId));
  }

  async triggerWebhook(manifestId: string, event: string, data: any) {
    const manifest = await prisma.manifest.findUnique({
      where: { id: manifestId },
      select: { companyId: true },
    });
    if (!manifest) return;

    const cacheKey = cacheService.generateKey('webhooks', manifest.companyId);
    let webhooks = await cacheService.get<any[]>(cacheKey);

    if (!webhooks) {
      webhooks = await prisma.webhook.findMany({
        where: { companyId: manifest.companyId, isActive: true },
      });
      await cacheService.set(cacheKey, webhooks, 300);
    }

    const matchingWebhooks = webhooks.filter((w: any) => w.events.includes(event));

    for (const webhook of matchingWebhooks) {
      await webhookQueue.add('deliver', {
        webhookId: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        event,
        data,
        manifestId,
        companyId: manifest.companyId,
      });
    }

    logger.info('Webhooks triggered', {
      event,
      manifestId,
      webhookCount: matchingWebhooks.length,
    });
  }

  async sendWebhookDelivery(jobData: any) {
    const { webhookId, url, secret, event, data, manifestId, companyId } = jobData;

    const signature = this.generateSignature(secret, JSON.stringify(data));
    const startTime = Date.now();

    try {
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Delivery-ID': webhookId,
        },
        timeout: 10000,
      });

      const duration = Date.now() - startTime;

      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          status: 'success',
          responseCode: response.status,
          timestamp: new Date(),
        },
      });

      logger.info('Webhook delivered', {
        webhookId,
        event,
        statusCode: response.status,
        duration,
      });

      return { success: true, statusCode: response.status, duration };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const statusCode = error.response?.status || 500;

      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          status: 'failed',
          responseCode: statusCode,
          timestamp: new Date(),
        },
      });

      logger.error('Webhook delivery failed', {
        webhookId,
        event,
        statusCode,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  async handleExternalWebhook(companyId: string, payload: any, headers: any) {
    // Verify company exists
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Company not found');
    
    // Trigger internal webhooks for this company
    await this.triggerWebhook('external', 'external.received', { body: payload, headers, companyId });
    
    // Also store raw payload for audit
    await prisma.externalWebhookLog.create({
      data: {
        companyId,
        payload,
        headers: headers as any,
        receivedAt: new Date(),
      },
    });
    
    logger.info('External webhook received', { companyId });
    return { received: true };
  }

  private generateSignature(secret: string, payload: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
}

export const webhookManager = new WebhookManager();
