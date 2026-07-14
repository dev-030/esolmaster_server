import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/database/prisma-client/client';


if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const EXCLUDED_USER_ID = 'iD9OTrynd0DLATbN8vpJk';

async function main() {
  const freePlan = await prisma.subscriptionPlan.findFirst({
    where: {
      type: 'FREE',
      isActive: true,
    },
  });

  if (!freePlan) {
    throw new Error('FREE plan not found');
  }

  const teachersWithoutSubscription = await prisma.user.findMany({
    where: {
      role: Role.teacher,
      id: {
        not: EXCLUDED_USER_ID,
      },
      userSubscription: null,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!teachersWithoutSubscription.length) {
    console.log('ℹ️ No teachers need free subscriptions');
    return;
  }

  await prisma.userSubscription.createMany({
    data: teachersWithoutSubscription.map((user) => ({
      userId: user.id,
      planId: freePlan.id,
      billingStatus: 'ACTIVE',
      billingCycle: null,
      boughtPrice: 0,
      discountAmount: 0,
      finalPrice: 0,
      cancelAtPeriodEnd: false,
    })),
    skipDuplicates: true,
  });

  console.log(
    `✅ Created free subscriptions for ${teachersWithoutSubscription.length} teachers`,
  );

  teachersWithoutSubscription.forEach((user) => {
    console.log(`→ ${user.email}`);
  });
}

main()
  .catch((e) => {
    console.error('❌ Script failed');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });