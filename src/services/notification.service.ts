import { emailQueue, smsQueue, pushNotificationQueue } from '../config/queue';
import prisma from '../config/database';
import logger from '../config/logger';

export const notificationService = {
  async send(userId: string, type: string, data: any) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true },
    });

    if (!user) return;

    if (user.email) {
      await emailQueue.add('send', {
        to: user.email,
        template: type,
        data,
      });
    }

    if (user.phone) {
      await smsQueue.add('send', {
        to: user.phone,
        message: this.getSMSMessage(type, data),
      });
    }

    logger.info('Notification queued', { userId, type });
  },

  getSMSMessage(type: string, data: any): string {
    const messages: Record<string, string> = {
      compliance_violation: `ALERT: Compliance violation on manifest ${data.manifestNumber}`,
      new_bid: `New bid of $${data.amount} received on your listing`,
      bid_accepted: `Your bid of $${data.amount} was accepted!`,
      manifest_assigned: `New manifest ${data.manifestNumber} assigned to you`,
      payment_failed: `Payment failed – please update payment method`,
    };
    return messages[type] || 'New notification from VeriManifest';
  },
};
