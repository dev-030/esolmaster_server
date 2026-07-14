import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/database/prisma-client/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.user.updateMany({
    where: {
      isOnboarded: false,
    },
    data: {
      isOnboarded: true,
    },
  });

  console.log(`✅ Updated ${result.count} users to isOnboarded=true`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());