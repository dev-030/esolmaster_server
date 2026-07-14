import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient, Role } from '../src/database/prisma-client/client';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
if (!process.env.ADMIN_EMAIL) throw new Error('ADMIN_EMAIL missing');
if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD missing');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL!;
  const password = process.env.ADMIN_PASSWORD!;

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (!existing) {
    const hashed = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: Role.admin,
        firstName: 'Admin',
        lastName: 'User',
      },
    });

    console.log(`✅ Admin created: ${email}`);
  } else {
    console.log(`ℹ️ Admin already exists: ${email}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
