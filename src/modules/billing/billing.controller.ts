import { Request, Response, NextFunction } from 'express';
import { billingService } from './billing.service';
import { AuthRequest } from '../../middleware/auth';
import Stripe from 'stripe';
import { environment } from '../../config/environment';

const stripe = new Stripe(environment.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as any });

export class BillingController {
  async createCheckout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { priceId, successUrl, cancelUrl } = req.body;
      const session = await billingService.createCheckoutSession(
        req.user!.companyId,
        priceId,
        successUrl,
        cancelUrl
      );
      res.json({ success: true, data: session });
    } catch (error) {
      next(error);
    }
  }

  async createPortalSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { returnUrl } = req.body;
      const session = await billingService.createPortalSession(
        req.user!.companyId,
        returnUrl
      );
      res.json({ success: true, data: session });
    } catch (error) {
      next(error);
    }
  }

  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const sig = req.headers['stripe-signature'] as string;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          environment.STRIPE_WEBHOOK_SECRET
        );
      } catch (err: any) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      await billingService.handleWebhook(event);
      res.json({ received: true });
    } catch (error) {
      next(error);
    }
  }

  async subscription(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sub = await billingService.getSubscription(req.user!.companyId);
      res.json({ success: true, data: sub });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await billingService.cancelSubscription(req.user!.companyId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async reactivate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await billingService.reactivateSubscription(req.user!.companyId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async invoices(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const invoices = await billingService.getInvoices(req.user!.companyId);
      res.json({ success: true, data: invoices });
    } catch (error) {
      next(error);
    }
  }

  async paymentMethods(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const methods = await billingService.getPaymentMethods(req.user!.companyId);
      res.json({ success: true, data: methods });
    } catch (error) {
      next(error);
    }
  }
}
