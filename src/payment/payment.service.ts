import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
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
    constructor(private readonly prisma: PrismaService) {}
    async getSubscriptionPlans() {
  return this.prisma.subscriptionPlan.findMany({
    where: {
      isActive: true,
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
    },
  });
}

async createCheckoutSession(
  userId: string,
  dto: CreateCheckoutSessionDto,
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

  if (plan.type === 'FREE') {
    throw new BadRequestException('Free plan does not need checkout');
  }

  const stripePriceId =
    billingCycle === 'ANNUAL'
      ? plan.stripeAnnualPriceId
      : plan.stripeMonthlyPriceId;

  if (!stripePriceId) {
    throw new BadRequestException('Stripe price ID missing');
  }

  if (!process.env.FRONTEND_URL) {
    throw new BadRequestException('FRONTEND_URL is missing');
  }

  let stripeCustomerId = user.userSubscription?.stripeCustomerId ?? null;

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

    await this.prisma.userSubscription.upsert({
      where: {
        userId: user.id,
      },
      update: {
        stripeCustomerId,
      },
     create: {
    userId: user.id,
    planId: 'free_plan', // or fetch FREE plan dynamically
    billingStatus: 'ACTIVE',
    stripeCustomerId,
    boughtPrice: 0,
    discountAmount: 0,
    finalPrice: 0,
  },
    });
  }

  const session = await this.stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [
      {
        price: stripePriceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.FRONTEND_URL}/profile_teacher/billing_info?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/profile_teacher/billing_info?cancelled=true`,
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
  });

  return {
    url: session.url,
  };
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

  if (!subscription) {
    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: {
        id: 'free_plan',
      },
    });

    return {
      billingStatus: 'ACTIVE',
      billingCycle: null,
      boughtPrice: 0,
      discountAmount: 0,
      finalPrice: 0,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      plan: freePlan,
    };
  }

  return subscription;
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

    case 'price.updated':
      await this.handlePriceUpdated(event.data.object);
      break;

    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
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
      : session.subscription?.id;

  if (!stripeSubscriptionId) return;

  const stripeSubscription =
    await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

  const price =
    billingCycle === 'ANNUAL'
      ? plan.annualPrice
      : plan.monthlyPrice;

  const period = this.calculateBillingPeriod(
    stripeSubscription.start_date,
    billingCycle,
  );

  await this.prisma.userSubscription.update({
    where: { userId },
    data: {
      planId: plan.id,
      billingCycle,
      billingStatus: 'ACTIVE',
      stripeCustomerId:
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id,
      stripeSubscriptionId,
      stripePriceId:
        billingCycle === 'ANNUAL'
          ? plan.stripeAnnualPriceId
          : plan.stripeMonthlyPriceId,
      boughtPrice: price,
      discountAmount: 0,
      finalPrice: price,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    },
  });
}

private async handleSubscriptionUpdated(subscription) {
  const stripeSubscriptionId = subscription.id;

  const existing = await this.prisma.userSubscription.findFirst({
    where: { stripeSubscriptionId },
  });

  if (!existing) return;

  const stripePriceId =
    subscription.items?.data?.[0]?.price?.id;

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
    plan.stripeAnnualPriceId === stripePriceId
      ? 'ANNUAL'
      : 'MONTHLY';

  const price =
    billingCycle === 'ANNUAL'
      ? plan.annualPrice
      : plan.monthlyPrice;

  const period = this.calculateBillingPeriod(
    subscription.start_date,
    billingCycle,
  );

  await this.prisma.userSubscription.update({
    where: { userId: existing.userId },
    data: {
      planId: plan.id,
      billingCycle,
      billingStatus: subscription.cancel_at_period_end
        ? 'CANCELING'
        : this.mapStripeStatus(subscription.status),
      stripePriceId,
      boughtPrice: price,
      finalPrice: price,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd:
        subscription.cancel_at_period_end,
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

  await this.prisma.userSubscription.updateMany({
    where: {
      stripeSubscriptionId,
    },
    data: {
      billingStatus: 'ACTIVE',
    },
  });
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
  const subscription = await this.prisma.userSubscription.findUnique({
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
    throw new NotFoundException('Subscription not found');
  }

  let billingHistory: any[] = [];
  let paymentMethod: any = null;

  if (subscription.stripeCustomerId) {
    const invoices = await this.stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 10,
    });

    billingHistory = invoices.data.map((invoice: any) => ({
      id: invoice.id,
      date: invoice.created
        ? new Date(invoice.created * 1000).toISOString()
        : null,
      plan: subscription.plan.name,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      invoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
    }));
  }

  if (subscription.stripeSubscriptionId) {
    const stripeSubscription: any =
      await this.stripe.subscriptions.retrieve(subscription.stripeSubscriptionId, {
        expand: ['default_payment_method'],
      });

    const defaultPaymentMethod = stripeSubscription.default_payment_method;

    if (defaultPaymentMethod?.card) {
      paymentMethod = {
        brand: defaultPaymentMethod.card.brand,
        last4: defaultPaymentMethod.card.last4,
        expMonth: defaultPaymentMethod.card.exp_month,
        expYear: defaultPaymentMethod.card.exp_year,
      };
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

  const where = {
    ...(query.planType && {
      plan: {
        type: query.planType,
      },
    }),

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
