import Stripe from 'stripe';
import prisma from '../../config/database';
import { environment } from '../../config/environment';
import { cacheService } from '../../services/cache.service';
import { notificationService } from '../../services/notification.service';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';

const stripe = new Stripe(environment.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as any });

export class BillingService {
  async createCustomer(companyId: string, email: string, name: string) {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { companyId },
    });

    await prisma.company.update({
      where: { id: companyId },
      data: { stripeCustomerId: customer.id },
    });

    return customer;
  }

  async createCheckoutSession(
    companyId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    let company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw AppError.notFound('Company not found');
    }

    if (!company.stripeCustomerId) {
      const user = await prisma.user.findFirst({
        where: { companyId, role: 'admin' },
      });
      if (!user) {
        throw AppError.badRequest('No admin user found for company');
      }
      await this.createCustomer(companyId, user.email, company.name);
      company = await prisma.company.findUnique({ where: { id: companyId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: company!.stripeCustomerId!,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { companyId },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    return { sessionId: session.id, url: session.url };
  }

  async createPortalSession(companyId: string, returnUrl: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.stripeCustomerId) {
      throw AppError.badRequest('No Stripe customer found');
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: portalSession.url };
  }

  async trackManifestCreation(companyId: string, manifestId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.stripeSubscriptionId) return;

    if (environment.USAGE_PRICE_ID_MANIFEST) {
      try {
        const subscription = await stripe.subscriptions.retrieve(company.stripeSubscriptionId, {
          expand: ['items.data.price'],
        });
        const subscriptionItem = subscription.items.data.find(
          item => item.price.id === environment.USAGE_PRICE_ID_MANIFEST
        );
        if (!subscriptionItem) {
          logger.warn('No subscription item found for usage price', {
            companyId,
            priceId: environment.USAGE_PRICE_ID_MANIFEST,
          });
          return;
        }

        const idempotencyKey = `manifest_usage_${manifestId}`;
        await stripe.subscriptionItems.createUsageRecord(
          subscriptionItem.id,
          {
            quantity: 1,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'increment',
          },
          { idempotencyKey }
        );
        logger.info('Usage record created for manifest', { companyId, manifestId });
      } catch (error) {
        logger.error('Failed to create usage record', { error });
      }
    }
  }

  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        if (companyId && session.subscription) {
          await prisma.company.update({
            where: { id: companyId },
            data: {
              subscriptionStatus: 'active',
              stripeSubscriptionId: session.subscription as string,
            },
          });
          await cacheService.del(cacheService.generateKey('company', companyId));
          logger.info('Subscription activated', { companyId });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          const companyId = (customer as Stripe.Customer).metadata.companyId;
          const status = this.mapStripeStatus(subscription.status);
          
          await prisma.company.update({
            where: { id: companyId },
            data: { subscriptionStatus: status },
          });
          
          await cacheService.del(cacheService.generateKey('company', companyId));
          logger.info('Subscription updated', { companyId, status });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          const companyId = (customer as Stripe.Customer).metadata.companyId;
          await prisma.company.update({
            where: { id: companyId },
            data: { subscriptionStatus: 'cancelled' },
          });
          await cacheService.del(cacheService.generateKey('company', companyId));
          logger.info('Subscription cancelled', { companyId });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          const companyId = (customer as Stripe.Customer).metadata.companyId;
          logger.error('Invoice payment failed', { companyId, invoiceId: invoice.id });
          
          // Notify company admins
          const admins = await prisma.user.findMany({
            where: { companyId, role: 'admin' },
            select: { id: true },
          });
          for (const admin of admins) {
            await notificationService.send(admin.id, 'payment_failed', {
              amount: invoice.amount_due,
              currency: invoice.currency,
              dueDate: invoice.due_date,
            });
          }
        }
        break;
      }
    }
  }

  async getSubscription(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.stripeSubscriptionId) return null;

    const cacheKey = cacheService.generateKey('subscription', companyId);
    return cacheService.getOrSet(
      cacheKey,
      () => stripe.subscriptions.retrieve(company.stripeSubscriptionId!),
      300
    );
  }

  async cancelSubscription(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.stripeSubscriptionId) {
      throw AppError.badRequest('No active subscription');
    }

    const subscription = await stripe.subscriptions.update(
      company.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    await cacheService.del(cacheService.generateKey('subscription', companyId));

    return subscription;
  }

  async reactivateSubscription(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.stripeSubscriptionId) {
      throw AppError.badRequest('No subscription found');
    }

    const subscription = await stripe.subscriptions.update(
      company.stripeSubscriptionId,
      { cancel_at_period_end: false }
    );

    await cacheService.del(cacheService.generateKey('subscription', companyId));

    return subscription;
  }

  async getInvoices(companyId: string, limit = 20) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.stripeCustomerId) return [];

    const invoices = await stripe.invoices.list({
      customer: company.stripeCustomerId,
      limit,
    });

    return invoices.data;
  }

  async getPaymentMethods(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.stripeCustomerId) return [];

    const paymentMethods = await stripe.paymentMethods.list({
      customer: company.stripeCustomerId,
      type: 'card',
    });

    return paymentMethods.data;
  }

  private mapStripeStatus(stripeStatus: string): string {
    const statusMap: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      unpaid: 'past_due',
      canceled: 'cancelled',
      incomplete: 'pending',
      incomplete_expired: 'cancelled',
      trialing: 'active',
    };
    return statusMap[stripeStatus] || 'free';
  }
}

export const billingService = new BillingService();
