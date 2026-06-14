import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { AuthRequest } from '../../middleware/auth';
import { webhookManager } from '../../services/webhookManager';
import prisma from '../../config/database';
import { AppError } from '../../utils/AppError';

const router = Router();

// External webhook receiver
router.post('/receive/:companyId', async (req, res, next) => {
  try {
    const companyId = req.params.companyId;
    const webhookToken = req.headers['x-webhook-token'] as string;
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw AppError.notFound('Company not found');
    if (!webhookToken || webhookToken !== process.env.EXTERNAL_WEBHOOK_TOKEN) {
      throw AppError.unauthorized('Invalid webhook token');
    }
    await webhookManager.handleExternalWebhook(companyId, req.body, req.headers);
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

router.use(authenticate);

router.post('/register', async (req: AuthRequest, res, next) => {
  try {
    const { url, events } = req.body;
    const webhook = await webhookManager.registerWebhook(
      req.user!.companyId,
      url,
      events
    );
    res.status(201).json({ success: true, data: webhook });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { companyId: req.user!.companyId },
      include: { deliveries: { take: 10, orderBy: { timestamp: 'desc' } } },
    });
    res.json({ success: true, data: webhooks });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await webhookManager.deleteWebhook(req.params.id);
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
