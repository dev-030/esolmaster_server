import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { MailService } from 'src/mail/mail.service';
import Stripe from 'stripe';
import {
  AttachPremiumTasksDto,
  CreateCheckoutSessionDto,
  CreatePlanDto,
  UpdatePlanDto,
} from './dto/payment.dto';
import { BillingStatus, SubscriptionPlanType } from 'src/database/prisma-client/browser';


@Injectable()
export class PaymentService {
      private stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY as string,
  );
    constructor(
      private readonly prisma: PrismaService,
      private readonly mailService: MailService,
    ) {}

    private getFrontendUrl(requestOrigin?: string) {
      const configuredUrl = (process.env.FRONTEND_URL || 'https://frontend.esolmaster.co.uk').replace(/\/+$/, '');
      // Headers are user-controlled. Only use the browser origin when it is the
      // configured application origin; otherwise never create an open redirect.
      return requestOrigin === configuredUrl ? requestOrigin : configuredUrl;
    }

    async getSubscriptionPlans() {
  return this.prisma.subscriptionPlan.findMany({
    where: {
      isActive: true,
      // Safety: for paid plans, only return those that have been fully
      // configured in Stripe. FREE plans don't need a price ID.
      OR: [
        { type: 'FREE' },
        {
          type: { in: ['BASIC', 'PRO'] },
          stripeMonthlyPriceId: { not: null },
        },
      ],
    },
    orderBy: {
      monthlyPrice: 'asc',
    },
    select: {
      id: true,
      name: true,
      type: true,
      monthlyPrice: true,
      annualPrice: true,
      maxClasses: true,
      maxStudentsPerClass: true,
      maxScheduledTasksInClass: true,
      // Stripe IDs are NOT selected — frontend never sees them
    },
  });
}

async createCheckoutSession(
  userId: string,
  dto: CreateCheckoutSessionDto,
  origin?: string,
) {
  const { planId, billingCycle } = dto;

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      userSubscription: true,
    },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  if (user.role !== 'teacher') {
    throw new BadRequestException('Only teachers can subscribe');
  }

  const plan = await this.prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new NotFoundException('Subscription plan not found');
  }

  if (!plan.isActive) {
    throw new BadRequestException('This subscription plan is no longer available');
  }

  if (plan.type === 'FREE') {
    throw new BadRequestException('Free plan does not need checkout');
  }

  let subscription = user.userSubscription;
  if (!subscription) {
    const freePlan = await this.prisma.subscriptionPlan.findFirst({
      where: { type: 'FREE', isActive: true },
    });
    if (!freePlan) {
      throw new BadRequestException('The free subscription plan is not configured.');
    }
    subscription = await this.prisma.userSubscription.create({
      data: {
        userId: user.id,
        planId: freePlan.id,
        billingStatus: 'ACTIVE',
        boughtPrice: 0,
        discountAmount: 0,
        finalPrice: 0,
      },
    });
  }

  // A customer can have only one paid subscription. Existing subscribers must
  // use the portal/change flow so we never create a second Stripe subscription.
  if (subscription.stripeSubscriptionId) {
    throw new ConflictException(
      'You already have a subscription. Manage or change it from your billing portal.',
    );
  }

  const stripePriceId =
    billingCycle === 'ANNUAL'
      ? plan.stripeAnnualPriceId
      : plan.stripeMonthlyPriceId;

  if (!stripePriceId) {
    throw new BadRequestException('Stripe price ID missing for this plan');
  }

  const baseUrl = this.getFrontendUrl(origin);

  const checkoutClaimedAt = new Date();
  const expiredCheckoutCutoff = new Date(checkoutClaimedAt.getTime() - 24 * 60 * 60 * 1000);
  const claim = await this.prisma.userSubscription.updateMany({
    where: {
      userId,
      stripeSubscriptionId: null,
      OR: [
        { checkoutSessionId: null },
        { checkoutSessionCreatedAt: { lt: expiredCheckoutCutoff } },
      ],
    },
    data: {
      checkoutSessionId: 'PENDING',
      checkoutPlanId: plan.id,
      checkoutSessionCreatedAt: checkoutClaimedAt,
    },
  });

  if (!claim.count) {
    const pendingSubscription = await this.prisma.userSubscription.findUnique({
      where: { userId },
      select: { checkoutSessionId: true },
    });
    const existingSessionId = pendingSubscription?.checkoutSessionId;

    if (existingSessionId && existingSessionId !== 'PENDING') {
      const existingSession = await this.stripe.checkout.sessions.retrieve(existingSessionId);
      if (existingSession.status === 'open' && existingSession.url) {
        return { url: existingSession.url };
      }
      await this.prisma.userSubscription.updateMany({
        where: { userId, checkoutSessionId: existingSessionId },
        data: {
          checkoutSessionId: null,
          checkoutPlanId: null,
          checkoutSessionCreatedAt: null,
        },
      });
      return this.createCheckoutSession(userId, dto, origin);
    }

    throw new ConflictException('Checkout is being prepared. Please try again in a moment.');
  }

  let stripeCustomerId = subscription.stripeCustomerId ?? null;

  if (stripeCustomerId) {
    try {
      const customer = await this.stripe.customers.retrieve(stripeCustomerId);

      if ((customer as any).deleted) {
        stripeCustomerId = null;
      }
    } catch {
      stripeCustomerId = null;
    }
  }

  if (!stripeCustomerId) {
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: {
        userId: user.id,
      },
    });

    stripeCustomerId = customer.id;

    await this.prisma.userSubscription.update({
      where: { userId: user.id },
      data: { stripeCustomerId },
    });
  }

  let session;
  try {
    session = await this.stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [
      {
        price: stripePriceId,
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/profile_teacher/billing_info?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/profile_teacher/billing_info?cancelled=true`,
    metadata: {
      userId: user.id,
      planId: plan.id,
      billingCycle,
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        planId: plan.id,
        billingCycle,
      },
    },
    }, {
      idempotencyKey: `checkout:${user.id}:${checkoutClaimedAt.getTime()}`,
    });
  } catch (error) {
    await this.prisma.userSubscription.updateMany({
      where: { userId, checkoutSessionId: 'PENDING' },
      data: {
        checkoutSessionId: null,
        checkoutPlanId: null,
        checkoutSessionCreatedAt: null,
      },
    });
    throw error;
  }

  await this.prisma.userSubscription.update({
    where: { userId },
    data: { checkoutSessionId: session.id },
  });

  return {
    url: session.url,
  };
}

async confirmCheckoutSession(userId: string, sessionId: string) {
  if (!sessionId) {
    throw new BadRequestException('Session ID is required');
  }

  const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });

  if (!session) {
    throw new NotFoundException('Checkout session not found');
  }

  // Strict ownership check — metadata must be present and match
  if (!session.metadata?.userId || session.metadata.userId !== userId) {
    throw new BadRequestException('Session does not belong to the current user');
  }

  if (session.payment_status === 'paid' || session.status === 'complete') {
    // Idempotency guard: skip if the subscription in DB already references this Stripe subscription
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as any)?.id;

    if (stripeSubscriptionId) {
      const alreadyProcessed = await this.prisma.userSubscription.findFirst({
        where: { userId, stripeSubscriptionId },
        select: { id: true },
      });
      if (!alreadyProcessed) {
        await this.handleCheckoutSessionCompleted(session);
      }
    } else {
      await this.handleCheckoutSessionCompleted(session);
    }
  }

  return this.getMySubscription(userId);
}

async getMySubscription(userId: string) {
  const subscription = await this.prisma.userSubscription.findUnique({
    where: {
      userId,
    },
    include: {
      plan: true,
    },
  });

  let sub = subscription;
  const freePlan = await this.prisma.subscriptionPlan.findFirst({
    where: { type: 'FREE', isActive: true },
  });

  if (!sub) {
    sub = {
      id: '',
      userId,
      planId: freePlan?.id ?? '',
      billingStatus: 'ACTIVE',
      billingCycle: null,
      boughtPrice: 0,
      discountAmount: 0,
      finalPrice: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      changedByAdminId: null,
      changedAt: null,
      expiryNotifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: freePlan,
    } as any;
  }

  const hasAccess = ['ACTIVE', 'CANCELING', 'TRIALING'].includes(sub!.billingStatus);
  const effectivePlan = hasAccess ? sub!.plan : freePlan;

  const classesCount = await this.prisma.class.count({
    where: { teacherId: userId },
  });

  const planPremiumTasks = effectivePlan?.id
    ? await this.prisma.planPremiumTask.findMany({
        where: { planId: effectivePlan.id },
        select: { taskId: true },
      })
    : [];

  return {
    ...sub,
    effectivePlan,
    accessRevoked: !hasAccess,
    usage: {
      classesCount,
    },
    allowedPremiumTaskIds: planPremiumTasks.map((t) => t.taskId),
  };
}


async handleStripeWebhook(rawBody: Buffer, signature: string) {
  let event;

  try {
    event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.WEBHOOK_SECRET as string,
    );
  } catch (error) {
    console.log('WEBHOOK ERROR:', error);
    throw new BadRequestException('Invalid Stripe webhook signature');
  }

  const eventObject = event.data.object as { id?: string };
  let delivery;

  try {
    delivery = await this.prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        type: event.type,
        objectId: eventObject?.id,
      },
    });
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;

    delivery = await this.prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    // The first delivery is still processing, or this event already succeeded.
    if (!delivery || ['PROCESSING', 'PROCESSED'].includes(delivery.status)) {
      return { received: true };
    }

    delivery = await this.prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { status: 'PROCESSING', error: null },
    });
  }

  try {
  switch (event.type) {
    case 'checkout.session.completed':
      await this.handleCheckoutSessionCompleted(event.data.object);
      break;

    case 'customer.subscription.updated':
      await this.handleSubscriptionUpdated(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await this.handleSubscriptionDeleted(event.data.object);
      break;

    case 'invoice.paid':
      await this.handleInvoicePaid(event.data.object);
      break;

    case 'invoice.payment_failed':
      await this.handleInvoicePaymentFailed(event.data.object);
      break;

    case 'invoice.payment_action_required':
      await this.handlePaymentActionRequired(event.data.object);
      break;

    case 'customer.subscription.trial_will_end':
      // No trials in this product — log and ignore
      console.log('Stripe trial_will_end event received (trials not used)');
      break;

    case 'price.updated':
      await this.handlePriceUpdated(event.data.object);
      break;

    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }

    await this.prisma.stripeWebhookEvent.update({
      where: { id: delivery.id },
      data: { status: 'PROCESSED', processedAt: new Date(), error: null },
    });
  } catch (error: any) {
    await this.prisma.stripeWebhookEvent.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', error: String(error?.message ?? error).slice(0, 2000) },
    });
    throw error;
  }

  return { received: true };
}

private async handlePriceUpdated(price: any) {
  const plan = await this.prisma.subscriptionPlan.findFirst({
    where: {
      OR: [
        { stripeMonthlyPriceId: price.id },
        { stripeAnnualPriceId: price.id },
      ],
    },
  });

  if (!plan || !price.unit_amount) return;

  const isAnnual = plan.stripeAnnualPriceId === price.id;

  await this.prisma.subscriptionPlan.update({
    where: { id: plan.id },
    data: {
      [isAnnual ? 'annualPrice' : 'monthlyPrice']: price.unit_amount,
    },
  });
}

private async handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;
  const billingCycle = session.metadata?.billingCycle;

  if (!userId || !planId || !billingCycle) return;

  const plan = await this.prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan) return;

  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as any)?.id;

  if (!stripeSubscriptionId) return;

  // Always retrieve the live subscription from Stripe — source of truth
  const stripeSubscription: any = await this.stripe.subscriptions.retrieve(
    stripeSubscriptionId,
  );

  // Use Stripe's actual charged amount, not our DB plan price
  const stripeItem = stripeSubscription.items?.data?.[0];
  const actualPricePaid = stripeItem?.price?.unit_amount ?? (session.amount_total ?? 0);

  // Use Stripe's exact period timestamps — not calculated from start_date
  const currentPeriodStart = stripeSubscription.current_period_start
    ? new Date(stripeSubscription.current_period_start * 1000)
    : new Date();
  const currentPeriodEnd = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000)
    : new Date();

  // Use the price ID from the actual Stripe item, not from our DB
  const actualStripePriceId = stripeItem?.price?.id ?? (
    billingCycle === 'ANNUAL' ? plan.stripeAnnualPriceId : plan.stripeMonthlyPriceId
  );

  const subscriptionData = {
      planId: plan.id,
      billingCycle,
      billingStatus: 'ACTIVE' as BillingStatus,
      stripeCustomerId:
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer as any)?.id,
      stripeSubscriptionId,
      stripePriceId: actualStripePriceId,
      checkoutSessionId: null,
      checkoutPlanId: null,
      checkoutSessionCreatedAt: null,
      boughtPrice: actualPricePaid,
      discountAmount: 0,
      finalPrice: actualPricePaid,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
  };

  await this.prisma.userSubscription.upsert({
    where: { userId },
    update: subscriptionData,
    create: { userId, ...subscriptionData },
  });
}

private async handleSubscriptionUpdated(subscription) {
  // Stripe events can arrive out of order. Retrieve the resource so the
  // database reflects Stripe's current state rather than an old event payload.
  try {
    subscription = await this.stripe.subscriptions.retrieve(subscription.id);
  } catch {
    // A deleted subscription is handled by customer.subscription.deleted.
  }

  const stripeSubscriptionId = subscription.id;

  const existing = await this.prisma.userSubscription.findFirst({
    where: { stripeSubscriptionId },
  });

  if (!existing) return;

  const stripeItem = subscription.items?.data?.[0];
  const stripePriceId = stripeItem?.price?.id;

  if (!stripePriceId) return;

  const plan = await this.prisma.subscriptionPlan.findFirst({
    where: {
      OR: [
        { stripeMonthlyPriceId: stripePriceId },
        { stripeAnnualPriceId: stripePriceId },
      ],
    },
  });

  if (!plan) return;

  const billingCycle =
    plan.stripeAnnualPriceId === stripePriceId ? 'ANNUAL' : 'MONTHLY';

  // Use Stripe's actual unit_amount as the source of truth — not our DB price
  const actualPrice = stripeItem?.price?.unit_amount ?? (
    billingCycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice
  );

  // Use Stripe's exact period timestamps
  const currentPeriodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : new Date();
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : new Date();

  await this.prisma.userSubscription.update({
    where: { userId: existing.userId },
    data: {
      planId: plan.id,
      billingCycle,
      billingStatus: subscription.cancel_at_period_end
        ? 'CANCELING'
        : this.mapStripeStatus(subscription.status),
      stripePriceId,
      boughtPrice: actualPrice,
      finalPrice: actualPrice,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    },
  });
}

private async handleSubscriptionDeleted(subscription) {
  const existing =
    await this.prisma.userSubscription.findFirst({
      where: {
        stripeSubscriptionId: subscription.id,
      },
    });

  if (!existing) return;

  const freePlan =
    await this.prisma.subscriptionPlan.findFirst({
      where: {
        type: 'FREE',
        isActive: true,
      },
    });

  if (!freePlan) return;

  await this.prisma.userSubscription.update({
    where: {
      userId: existing.userId,
    },
    data: {
      planId: freePlan.id,
      billingCycle: null,
      billingStatus: 'ACTIVE',
      boughtPrice: 0,
      discountAmount: 0,
      finalPrice: 0,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
    },
  });
}

private async handleInvoicePaid(invoice) {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!stripeSubscriptionId) return;

  // On renewal, fetch the updated subscription periods from Stripe
  try {
    const stripeSubscription: any = await this.stripe.subscriptions.retrieve(
      stripeSubscriptionId,
    );

    const currentPeriodStart = stripeSubscription.current_period_start
      ? new Date(stripeSubscription.current_period_start * 1000)
      : undefined;
    const currentPeriodEnd = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : undefined;

    await this.prisma.userSubscription.updateMany({
      where: { stripeSubscriptionId },
      data: {
        billingStatus: 'ACTIVE',
        ...(currentPeriodStart && { currentPeriodStart }),
        ...(currentPeriodEnd && { currentPeriodEnd }),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    });
  } catch {
    // Fallback: at minimum mark as active
    await this.prisma.userSubscription.updateMany({
      where: { stripeSubscriptionId },
      data: { billingStatus: 'ACTIVE' },
    });
  }
}

private async handleInvoicePaymentFailed(invoice) {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!stripeSubscriptionId) return;

  await this.prisma.userSubscription.updateMany({
    where: {
      stripeSubscriptionId,
    },
    data: {
      billingStatus: 'PAST_DUE',
    },
  });

  await this.notifyBillingIssue(
    stripeSubscriptionId,
    'Action needed: your ESOL Master payment failed',
    'We could not renew your subscription. Update your payment method to keep your classroom access active.',
  );
}

private async handlePaymentActionRequired(invoice) {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!stripeSubscriptionId) return;

  await this.prisma.userSubscription.updateMany({
    where: {
      stripeSubscriptionId,
    },
    data: {
      billingStatus: 'PAYMENT_ACTION_REQUIRED',
    },
  });

  await this.notifyBillingIssue(
    stripeSubscriptionId,
    'Action needed: confirm your ESOL Master payment',
    'Your bank needs you to confirm the latest subscription payment. Open billing to complete the payment and keep access active.',
  );
}

private async notifyBillingIssue(
  stripeSubscriptionId: string,
  subject: string,
  message: string,
) {
  const subscription = await this.prisma.userSubscription.findFirst({
    where: { stripeSubscriptionId },
    select: { user: { select: { email: true } } },
  });
  if (!subscription?.user.email) return;

  const billingUrl = `${this.getFrontendUrl()}/profile_teacher/billing_info`;
  await this.mailService.sendNotificationMail(
    subscription.user.email,
    subject,
    subject,
    `${message} <a href="${billingUrl}">Open billing</a>.`,
  );
}

private calculateBillingPeriod(
  stripeStartDate,
  billingCycle,
) {
  const currentPeriodStart = stripeStartDate
    ? new Date(stripeStartDate * 1000)
    : new Date();

  const currentPeriodEnd =
    new Date(currentPeriodStart);

  if (billingCycle === 'ANNUAL') {
    currentPeriodEnd.setFullYear(
      currentPeriodEnd.getFullYear() + 1,
    );
  } else {
    currentPeriodEnd.setMonth(
      currentPeriodEnd.getMonth() + 1,
    );
  }

  return {
    currentPeriodStart,
    currentPeriodEnd,
  };
}

private mapStripeStatus(status) {
  switch (status) {
    case 'active':
      return 'ACTIVE';

    case 'trialing':
      return 'TRIALING';

    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return 'PAST_DUE';

    case 'canceled':
      return 'CANCELED';

    default:
      return 'PAST_DUE';
  }
}

async getBillingInfo(userId: string) {
  let subscription = await this.prisma.userSubscription.findUnique({
    where: { userId },
    include: {
      plan: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!subscription) {
    const freePlan = await this.prisma.subscriptionPlan.findFirst({
      where: { type: 'FREE', isActive: true },
    });
    if (freePlan) {
      subscription = await this.prisma.userSubscription.create({
        data: {
          userId,
          planId: freePlan.id,
          billingStatus: 'ACTIVE',
          boughtPrice: 0,
          discountAmount: 0,
          finalPrice: 0,
        },
        include: {
          plan: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    } else {
      throw new NotFoundException('Subscription not found');
    }
  }

  let billingHistory: any[] = [];
  let paymentMethod: any = null;

  if (subscription.stripeCustomerId) {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: subscription.stripeCustomerId,
        limit: 10,
      });

      billingHistory = invoices.data.map((invoice: any) => ({
        id: invoice.id,
        date: invoice.created
          ? new Date(invoice.created * 1000).toISOString()
          : null,
        plan: subscription.plan?.name ?? 'Plan',
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        invoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
      }));
    } catch (err) {
      console.warn('Could not fetch Stripe invoices for customer:', err);
    }
  }

  if (subscription.stripeSubscriptionId) {
    try {
      const stripeSubscription: any =
        await this.stripe.subscriptions.retrieve(subscription.stripeSubscriptionId, {
          expand: ['default_payment_method'],
        });

      let defaultPaymentMethod = stripeSubscription.default_payment_method;

      // Fall back to customer's invoice_settings.default_payment_method
      if (!defaultPaymentMethod && stripeSubscription.customer) {
        const customerId =
          typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : stripeSubscription.customer?.id;
        if (customerId) {
          const customer: any = await this.stripe.customers.retrieve(customerId, {
            expand: ['invoice_settings.default_payment_method'],
          });
          defaultPaymentMethod = customer?.invoice_settings?.default_payment_method ?? null;
        }
      }

      if (defaultPaymentMethod?.card) {
        paymentMethod = {
          brand: defaultPaymentMethod.card.brand,
          last4: defaultPaymentMethod.card.last4,
          expMonth: defaultPaymentMethod.card.exp_month,
          expYear: defaultPaymentMethod.card.exp_year,
        };
      }
    } catch (err) {
      console.warn('Could not fetch Stripe subscription details:', err);
    }
  }

  return {
    currentSubscription: {
      id: subscription.id,
      planName: subscription.plan.name,
      planType: subscription.plan.type,
      billingCycle: subscription.billingCycle,
      billingStatus: subscription.billingStatus,
      boughtPrice: subscription.boughtPrice,
      discountAmount: subscription.discountAmount,
      finalPrice: subscription.finalPrice,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },

    nextBillingDate: subscription.currentPeriodEnd,

    paymentMethod,

    billingHistory,
  };
}

async createBillingPortalSession(userId: string, origin?: string) {
  const subscription = await this.prisma.userSubscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  });

  if (!subscription?.stripeCustomerId) {
    throw new BadRequestException('A paid subscription is required to manage billing details');
  }

  const baseUrl = this.getFrontendUrl(origin);
  const returnUrl = `${baseUrl}/profile_teacher/billing_info`;
  const session = await this.stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
    ...(process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID
      ? { configuration: process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID }
      : {}),
  });

  return { url: session.url };
}

/// Admin //

async getAdminBillingOverview() {
  const now = new Date();

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );

  const nextMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  );

  const previousMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  );

  const previousMonthEnd = currentMonthStart;

  const paidTypes = [
    SubscriptionPlanType.BASIC,
    SubscriptionPlanType.PRO,
  ];

  const [
    currentRevenue,
    previousRevenue,
    currentPaidSubscribers,
    previousPaidSubscribers,
    currentProSubscribers,
    previousProSubscribers,
    currentBasicSubscribers,
    previousBasicSubscribers,
    packages,
  ] = await Promise.all([
    this.prisma.userSubscription.aggregate({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: {
            in: paidTypes,
          },
        },
        createdAt: {
          gte: currentMonthStart,
          lt: nextMonthStart,
        },
      },
      _sum: {
        finalPrice: true,
      },
    }),

    this.prisma.userSubscription.aggregate({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: {
            in: paidTypes,
          },
        },
        createdAt: {
          gte: previousMonthStart,
          lt: previousMonthEnd,
        },
      },
      _sum: {
        finalPrice: true,
      },
    }),

    this.prisma.userSubscription.count({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: {
            in: paidTypes,
          },
        },
      },
    }),

    this.prisma.userSubscription.count({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: {
            in: paidTypes,
          },
        },
        createdAt: {
          lt: currentMonthStart,
        },
      },
    }),

    this.prisma.userSubscription.count({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: SubscriptionPlanType.PRO,
        },
      },
    }),

    this.prisma.userSubscription.count({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: SubscriptionPlanType.PRO,
        },
        createdAt: {
          lt: currentMonthStart,
        },
      },
    }),

    this.prisma.userSubscription.count({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: SubscriptionPlanType.BASIC,
        },
      },
    }),

    this.prisma.userSubscription.count({
      where: {
        billingStatus: BillingStatus.ACTIVE,
        plan: {
          type: SubscriptionPlanType.BASIC,
        },
        createdAt: {
          lt: currentMonthStart,
        },
      },
    }),

    this.prisma.subscriptionPlan.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        monthlyPrice: 'asc',
      },
    }),
  ]);

  const currentMonthRevenue =
    currentRevenue?._sum?.finalPrice || 0;

  const previousMonthRevenue =
    previousRevenue?._sum?.finalPrice || 0;

  return {
    revenue: {
      currentMonth: currentMonthRevenue,
      previousMonth: previousMonthRevenue,
      percentageChange: this.getPercent(
        previousMonthRevenue,
        currentMonthRevenue,
      ),
    },

    paidSubscribers: {
      currentMonth: currentPaidSubscribers,
      previousMonth: previousPaidSubscribers,
      percentageChange: this.getPercent(
        previousPaidSubscribers,
        currentPaidSubscribers,
      ),
    },

    planSubscribers: {
      pro: {
        currentMonth: currentProSubscribers,
        previousMonth: previousProSubscribers,
        percentageChange: this.getPercent(
          previousProSubscribers,
          currentProSubscribers,
        ),
      },

      basic: {
        currentMonth: currentBasicSubscribers,
        previousMonth: previousBasicSubscribers,
        percentageChange: this.getPercent(
          previousBasicSubscribers,
          currentBasicSubscribers,
        ),
      },
    },

    packages,
  };
}

async getAdminSubscribers(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);

  const skip = (page - 1) * limit;

  const paidTypes = [SubscriptionPlanType.BASIC, SubscriptionPlanType.PRO];

  const where: any = {
    plan: {
      type:
        query.planType && query.planType !== 'FREE'
          ? query.planType
          : { in: paidTypes },
    },

    ...(query.billingCycle && {
      billingCycle: query.billingCycle,
    }),

    ...(query.search && {
      user: {
        OR: [
          {
            firstName: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      },
    }),
  };

  const [data, total] = await Promise.all([
    this.prisma.userSubscription.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: true,
        plan: true,
      },
    }),

    this.prisma.userSubscription.count({
      where,
    }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async adminChangeUserPlan(userId: string, adminId: string, body: any) {
    const { planType, billingCycle } = body;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { type: planType, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    let subscription = await this.prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (planType === 'FREE') {
      if (subscription.stripeSubscriptionId) {
        try {
          await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        } catch (error) {
          console.error('Error canceling Stripe subscription:', error);
        }
      }

      return this.prisma.userSubscription.update({
        where: { userId },
        data: {
          planId: plan.id,
          billingCycle: null,
          billingStatus: 'ACTIVE',
          boughtPrice: 0,
          discountAmount: 0,
          finalPrice: 0,
          stripePriceId: null,
          stripeSubscriptionId: null,
          cancelAtPeriodEnd: false,
          changedByAdminId: adminId,
          changedAt: new Date(),
        },
      });
    }

    let stripeCustomerId = subscription.stripeCustomerId;
    if (!stripeCustomerId) {
      const stripeCustomer = await this.stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim(),
      });
      stripeCustomerId = stripeCustomer.id;
      
      subscription = await this.prisma.userSubscription.update({
        where: { userId },
        data: { stripeCustomerId },
      });
    }

    const stripePriceId = billingCycle === 'ANNUAL' ? plan.stripeAnnualPriceId : plan.stripeMonthlyPriceId;

    if (subscription.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      } catch (error) {
        console.error('Error canceling old Stripe subscription:', error);
      }
    }

    const couponId = process.env.ADMIN_FREE_COUPON || 'ADMIN_FREE';
    let stripeSub;
    
    try {
      stripeSub = await this.stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: stripePriceId as string }],
        discounts: [{ coupon: couponId }],
        cancel_at_period_end: true,
        metadata: {
          userId,
          planId: plan.id,
          billingCycle,
        }
      });
    } catch (error) {
      const err = error as unknown as {
        message: string;
      };
      throw new Error(`Failed to create Stripe subscription: ${err.message}`);
    }

    const price = billingCycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;

    try {
      const updatedSub = await this.prisma.userSubscription.update({
        where: { userId },
        data: {
          planId: plan.id,
          billingCycle,
          billingStatus: 'ACTIVE',
          boughtPrice: price,
          discountAmount: price,
          finalPrice: 0,
          stripePriceId,
          stripeSubscriptionId: stripeSub.id,
          cancelAtPeriodEnd: true,
          changedByAdminId: adminId,
          changedAt: new Date(),
          currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : new Date(),
          currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : new Date(Date.now() + (billingCycle === 'ANNUAL' ? 31536000000 : 2592000000)),
        },
      });

      console.log('✅ Successfully updated UserSubscription in database:', updatedSub.id);
      return updatedSub;
    } catch (dbError) {
      const error = dbError as unknown as {
        message: string;
      };
      console.error('❌ Failed to update UserSubscription in database:', dbError);
      throw new Error(`Database update failed: ${error.message}`);
    }
}
async adminCancelUserSubscription(
  userId,
  adminId,
) {
  const subscription =
    await this.prisma.userSubscription.findUnique({
      where: {
        userId,
      },
      include: {
        plan: true,
      },
    });

  if (!subscription) {
    throw new NotFoundException(
      'Subscription not found',
    );
  }

  if (
    subscription.plan.type === 'FREE'
  ) {
    throw new BadRequestException(
      'Already free plan',
    );
  }

  if (
    subscription.stripeSubscriptionId
  ) {
    await this.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    );
  }

  return this.prisma.userSubscription.update({
    where: {
      userId,
    },
    data: {
      billingStatus: 'CANCELING',
      cancelAtPeriodEnd: true,
      changedByAdminId: adminId,
      changedAt: new Date(),
    },
  });
}

private getPercent(previous, current) {
  if (previous === 0 && current === 0) {
    return 0;
  }

  if (previous === 0) {
    return 100;
  }

  return Number(
    (
      ((current - previous) / previous) *
      100
    ).toFixed(2),
  );
}

/* ============================================================
 * Admin: Package (SubscriptionPlan) management + Stripe sync
 * ============================================================ */

/**
 * Create a package in our DB and mirror it to Stripe: one Product + a
 * recurring monthly and/or annual Price. Price ids are stored so checkout
 * can reference them.
 */
async createPlan(dto: CreatePlanDto) {
  const existing = await this.prisma.subscriptionPlan.findUnique({
    where: { type: dto.type },
  });
  if (existing) {
    throw new ConflictException(
      `A ${dto.type} plan already exists. Update it instead.`,
    );
  }

  const currency = (dto.currency || 'usd').toLowerCase();

  let stripeProductId: string | null = null;
  let stripeMonthlyPriceId: string | null = null;
  let stripeAnnualPriceId: string | null = null;

  // FREE plans need no Stripe product.
  if (dto.type !== 'FREE') {
    const product = await this.stripe.products.create({
      name: dto.name,
      description: dto.description,
      metadata: { planType: dto.type },
    });
    stripeProductId = product.id;

    if (dto.monthlyPrice > 0) {
      const monthly = await this.stripe.prices.create({
        product: product.id,
        currency,
        unit_amount: dto.monthlyPrice,
        recurring: { interval: 'month' },
      });
      stripeMonthlyPriceId = monthly.id;
    }

    if (dto.annualPrice > 0) {
      const annual = await this.stripe.prices.create({
        product: product.id,
        currency,
        unit_amount: dto.annualPrice,
        recurring: { interval: 'year' },
      });
      stripeAnnualPriceId = annual.id;
    }
  }

  return this.prisma.subscriptionPlan.create({
    data: {
      name: dto.name,
      type: dto.type,
      monthlyPrice: dto.monthlyPrice,
      annualPrice: dto.annualPrice,
      maxClasses: dto.maxClasses,
      maxStudentsPerClass: dto.maxStudentsPerClass,
      maxScheduledTasksInClass: dto.maxScheduledTasksInClass,
      stripeProductId,
      stripeMonthlyPriceId,
      stripeAnnualPriceId,
    },
  });
}

/**
 * Update a package. Name/description changes are pushed to the Stripe
 * product. Price changes create a NEW Stripe price (prices are immutable)
 * and archive the previous one.
 */
async updatePlan(planId: string, dto: UpdatePlanDto) {
  const plan = await this.prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });
  if (!plan) throw new NotFoundException('Plan not found');

  const currency = (dto.currency || 'usd').toLowerCase();
  const data: any = {};

  if (dto.name !== undefined) data.name = dto.name;
  if (dto.maxClasses !== undefined) data.maxClasses = dto.maxClasses;
  if (dto.maxStudentsPerClass !== undefined)
    data.maxStudentsPerClass = dto.maxStudentsPerClass;
  if (dto.maxScheduledTasksInClass !== undefined)
    data.maxScheduledTasksInClass = dto.maxScheduledTasksInClass;
  if (dto.isActive !== undefined) data.isActive = dto.isActive;

  if (plan.type !== 'FREE') {
    // Ensure a Stripe product exists (older/seeded plans may lack one).
    let productId = plan.stripeProductId;
    if (!productId) {
      const product = await this.stripe.products.create({
        name: dto.name ?? plan.name,
        description: dto.description,
        metadata: { planType: plan.type },
      });
      productId = product.id;
      data.stripeProductId = productId;
    } else if (dto.name !== undefined || dto.description !== undefined) {
      await this.stripe.products.update(productId, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      });
    }

    if (dto.monthlyPrice !== undefined && dto.monthlyPrice !== plan.monthlyPrice) {
      data.monthlyPrice = dto.monthlyPrice;
      if (dto.monthlyPrice > 0) {
        const price = await this.stripe.prices.create({
          product: productId,
          currency,
          unit_amount: dto.monthlyPrice,
          recurring: { interval: 'month' },
        });
        data.stripeMonthlyPriceId = price.id;
      }
      if (plan.stripeMonthlyPriceId) {
        await this.stripe.prices
          .update(plan.stripeMonthlyPriceId, { active: false })
          .catch(() => undefined);
      }
    }

    if (dto.annualPrice !== undefined && dto.annualPrice !== plan.annualPrice) {
      data.annualPrice = dto.annualPrice;
      if (dto.annualPrice > 0) {
        const price = await this.stripe.prices.create({
          product: productId,
          currency,
          unit_amount: dto.annualPrice,
          recurring: { interval: 'year' },
        });
        data.stripeAnnualPriceId = price.id;
      }
      if (plan.stripeAnnualPriceId) {
        await this.stripe.prices
          .update(plan.stripeAnnualPriceId, { active: false })
          .catch(() => undefined);
      }
    }
  } else {
    if (dto.monthlyPrice !== undefined) data.monthlyPrice = dto.monthlyPrice;
    if (dto.annualPrice !== undefined) data.annualPrice = dto.annualPrice;
  }

  return this.prisma.subscriptionPlan.update({
    where: { id: planId },
    data,
  });
}

/** Admin list of all plans with their attached premium tasks. */
async listAdminPlans() {
  return this.prisma.subscriptionPlan.findMany({
    orderBy: { monthlyPrice: 'asc' },
    include: {
      premiumTasks: {
        include: {
          task: {
            select: { id: true, title: true, type: true, isPremium: true },
          },
        },
      },
      _count: { select: { subscriptions: true } },
    },
  });
}

/** Attach premium tasks to a package. Only tasks flagged premium qualify. */
async attachPremiumTasks(planId: string, dto: AttachPremiumTasksDto) {
  const plan = await this.prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });
  if (!plan) throw new NotFoundException('Plan not found');

  const tasks = await this.prisma.task.findMany({
    where: { id: { in: dto.taskIds } },
    select: { id: true, isPremium: true },
  });

  const nonPremium = tasks.filter((t) => !t.isPremium);
  if (nonPremium.length) {
    throw new BadRequestException(
      'Only premium tasks can be added to a package',
    );
  }

  await this.prisma.planPremiumTask.createMany({
    data: tasks.map((t) => ({ planId, taskId: t.id })),
    skipDuplicates: true,
  });

  return this.getPlanPremiumTasks(planId);
}

async detachPremiumTask(planId: string, taskId: string) {
  await this.prisma.planPremiumTask.deleteMany({
    where: { planId, taskId },
  });
  return { success: true };
}

async getPlanPremiumTasks(planId: string) {
  return this.prisma.planPremiumTask.findMany({
    where: { planId },
    include: {
      task: {
        select: { id: true, title: true, type: true, isPremium: true, status: true },
      },
    },
  });
}

}
