import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, SubscriptionPlanType } from '../src/database/prisma-client/client';
import Stripe from 'stripe';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

async function getOrCreateStripeProduct(
  name: string,
  type: SubscriptionPlanType,
  monthlyCents: number,
  annualCents: number,
  existingProdId?: string | null,
  existingMonthlyPriceId?: string | null,
  existingAnnualPriceId?: string | null,
) {
  if (!stripe || type === 'FREE') {
    return {
      stripeProductId: null,
      stripeMonthlyPriceId: null,
      stripeAnnualPriceId: null,
    };
  }

  try {
    let productId = existingProdId;
    if (!productId) {
      const product = await stripe.products.create({
        name,
        description: `ESOL Master ${name} Plan`,
        metadata: { planType: type },
      });
      productId = product.id;
    }

    let monthlyPriceId = existingMonthlyPriceId;
    if (!monthlyPriceId && monthlyCents > 0) {
      const monthly = await stripe.prices.create({
        product: productId,
        currency: 'usd',
        unit_amount: monthlyCents,
        recurring: { interval: 'month' },
      });
      monthlyPriceId = monthly.id;
    }

    let annualPriceId = existingAnnualPriceId;
    if (!annualPriceId && annualCents > 0) {
      const annual = await stripe.prices.create({
        product: productId,
        currency: 'usd',
        unit_amount: annualCents,
        recurring: { interval: 'year' },
      });
      annualPriceId = annual.id;
    }

    return {
      stripeProductId: productId,
      stripeMonthlyPriceId: monthlyPriceId,
      stripeAnnualPriceId: annualPriceId,
    };
  } catch (err) {
    console.warn(`Stripe sync skipped for ${name}:`, err);
    return {
      stripeProductId: existingProdId ?? null,
      stripeMonthlyPriceId: existingMonthlyPriceId ?? null,
      stripeAnnualPriceId: existingAnnualPriceId ?? null,
    };
  }
}

async function main() {
  console.log('🌱 Standardizing Subscription Plans...');

  // 1. FREE Plan
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { type: 'FREE' },
    update: {
      name: 'Free',
      monthlyPrice: 0,
      annualPrice: 0,
      maxClasses: 2,
      maxStudentsPerClass: 20,
      maxScheduledTasksInClass: 5,
      isActive: true,
    },
    create: {
      name: 'Free',
      type: 'FREE',
      monthlyPrice: 0,
      annualPrice: 0,
      maxClasses: 2,
      maxStudentsPerClass: 20,
      maxScheduledTasksInClass: 5,
      isActive: true,
    },
  });
  console.log('✅ FREE Plan configured:', freePlan.id);

  // 2. BASIC Plan
  const existingBasic = await prisma.subscriptionPlan.findFirst({
    where: { type: 'BASIC' },
  });

  const basicStripe = await getOrCreateStripeProduct(
    'Basic',
    'BASIC',
    999, // $9.99
    9999, // $99.99
    existingBasic?.stripeProductId,
    existingBasic?.stripeMonthlyPriceId,
    existingBasic?.stripeAnnualPriceId,
  );

  const basicPlan = await prisma.subscriptionPlan.upsert({
    where: { type: 'BASIC' },
    update: {
      name: 'Basic',
      monthlyPrice: 999,
      annualPrice: 9999,
      maxClasses: 5,
      maxStudentsPerClass: 40,
      maxScheduledTasksInClass: 15,
      isActive: true,
      stripeProductId: basicStripe.stripeProductId,
      stripeMonthlyPriceId: basicStripe.stripeMonthlyPriceId,
      stripeAnnualPriceId: basicStripe.stripeAnnualPriceId,
    },
    create: {
      name: 'Basic',
      type: 'BASIC',
      monthlyPrice: 999,
      annualPrice: 9999,
      maxClasses: 5,
      maxStudentsPerClass: 40,
      maxScheduledTasksInClass: 15,
      isActive: true,
      stripeProductId: basicStripe.stripeProductId,
      stripeMonthlyPriceId: basicStripe.stripeMonthlyPriceId,
      stripeAnnualPriceId: basicStripe.stripeAnnualPriceId,
    },
  });
  console.log('✅ BASIC Plan configured:', basicPlan.id);

  // 3. PRO Plan
  const existingPro = await prisma.subscriptionPlan.findFirst({
    where: { type: 'PRO' },
  });

  const proStripe = await getOrCreateStripeProduct(
    'Pro',
    'PRO',
    1999, // $19.99
    19999, // $199.99
    existingPro?.stripeProductId,
    existingPro?.stripeMonthlyPriceId,
    existingPro?.stripeAnnualPriceId,
  );

  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { type: 'PRO' },
    update: {
      name: 'Pro',
      monthlyPrice: 1999,
      annualPrice: 19999,
      maxClasses: 25,
      maxStudentsPerClass: 100,
      maxScheduledTasksInClass: 50,
      isActive: true,
      stripeProductId: proStripe.stripeProductId,
      stripeMonthlyPriceId: proStripe.stripeMonthlyPriceId,
      stripeAnnualPriceId: proStripe.stripeAnnualPriceId,
    },
    create: {
      name: 'Pro',
      type: 'PRO',
      monthlyPrice: 1999,
      annualPrice: 19999,
      maxClasses: 25,
      maxStudentsPerClass: 100,
      maxScheduledTasksInClass: 50,
      isActive: true,
      stripeProductId: proStripe.stripeProductId,
      stripeMonthlyPriceId: proStripe.stripeMonthlyPriceId,
      stripeAnnualPriceId: proStripe.stripeAnnualPriceId,
    },
  });
  console.log('✅ PRO Plan configured:', proPlan.id);

  // 4. Attach all premium tasks to PRO plan
  const premiumTasks = await prisma.task.findMany({
    where: { isPremium: true },
    select: { id: true },
  });

  if (premiumTasks.length > 0) {
    await prisma.planPremiumTask.createMany({
      data: premiumTasks.map((t) => ({
        planId: proPlan.id,
        taskId: t.id,
      })),
      skipDuplicates: true,
    });
    console.log(`✅ Attached ${premiumTasks.length} premium tasks to PRO Plan`);
  }

  // 5. Ensure all teachers have an active userSubscription
  const teachersWithoutSub = await prisma.user.findMany({
    where: {
      role: Role.teacher,
      userSubscription: null,
    },
    select: { id: true, email: true },
  });

  if (teachersWithoutSub.length > 0) {
    await prisma.userSubscription.createMany({
      data: teachersWithoutSub.map((teacher) => ({
        userId: teacher.id,
        planId: freePlan.id,
        billingStatus: 'ACTIVE',
        billingCycle: null,
        boughtPrice: 0,
        discountAmount: 0,
        finalPrice: 0,
      })),
      skipDuplicates: true,
    });
    console.log(`✅ Assigned ${teachersWithoutSub.length} teachers to FREE Plan`);
  } else {
    console.log('ℹ️ All teachers already have a subscription record');
  }

  console.log('🎉 Subscription plans synchronization complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
