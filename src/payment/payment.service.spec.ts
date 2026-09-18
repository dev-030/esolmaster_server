import { ConflictException } from '@nestjs/common';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  const createService = (prisma: any) => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_subscription_lifecycle';
    return new PaymentService(prisma, { sendNotificationMail: jest.fn() } as any);
  };

  it('refuses Checkout when the teacher already has a Stripe subscription', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'teacher-1',
          role: 'teacher',
          userSubscription: { stripeSubscriptionId: 'sub_existing' },
        }),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pro', type: 'PRO', isActive: true }),
      },
    };
    const service = createService(prisma);

    await expect(
      service.createCheckoutSession('teacher-1', { planId: 'pro', billingCycle: 'MONTHLY' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reuses an open Checkout session instead of creating another payment attempt', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'teacher-1',
          role: 'teacher',
          userSubscription: { stripeSubscriptionId: null, stripeCustomerId: 'cus_1' },
        }),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pro', type: 'PRO', isActive: true, stripeMonthlyPriceId: 'price_pro',
        }),
      },
      userSubscription: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ checkoutSessionId: 'cs_open' }),
      },
    };
    const service = createService(prisma) as any;
    service.stripe = {
      checkout: {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({ status: 'open', url: 'https://checkout.stripe.test/cs_open' }),
        },
      },
    };

    await expect(
      service.createCheckoutSession('teacher-1', { planId: 'pro', billingCycle: 'MONTHLY' }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.test/cs_open' });
  });

  it('ignores an already processed Stripe event', async () => {
    const prisma = {
      stripeWebhookEvent: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue({ status: 'PROCESSED' }),
      },
    };
    const service = createService(prisma) as any;
    service.stripe = {
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({
          id: 'evt_duplicate',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_duplicate' } },
        }),
      },
    };

    await expect(service.handleStripeWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({ received: true });
    expect(prisma.stripeWebhookEvent.findUnique).toHaveBeenCalledWith({
      where: { stripeEventId: 'evt_duplicate' },
    });
  });
});
