import { Router, raw } from 'express';
import { BillingController } from './billing.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new BillingController();

router.post('/webhooks', raw({ type: 'application/json' }), controller.webhook);

router.use(authenticate);
router.post('/checkout', controller.createCheckout);
router.post('/portal', controller.createPortalSession);
router.get('/subscription', controller.subscription);
router.post('/cancel', controller.cancel);
router.post('/reactivate', controller.reactivate);
router.get('/invoices', controller.invoices);
router.get('/payment-methods', controller.paymentMethods);

export default router;
