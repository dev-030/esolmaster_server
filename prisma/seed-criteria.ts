import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/database/prisma-client/client';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const standardCriteria = [
  { code: '1.1', description: 'Follow the chronological order or main narrative in continuous text' },
  { code: '1.2', description: 'Recognize the main points of short texts in chronological or continuous format' },
  { code: '2.1', description: 'Identify the main points in short explanations or instructions' },
  { code: '3.1', description: 'Extract specific information from simple texts' },
  { code: '3.2', description: 'Understand the meaning of common signs and symbols' },
  { code: '3.3', description: 'Recognize common formats (dates, postcodes, addresses, emails)' },
  { code: '3.4', description: 'Use numerical information (house numbers, prices, times)' },
  { code: '4.1', description: 'Use first and second place letters to sequence or find words in alphabetical order' },
  { code: 'W1.1', description: 'Complete forms with personal details (Name, Address, Postcode, DOB)' },
  { code: 'W1.2', description: 'Write short simple sentences with appropriate capital letters and full stops' },
  { code: 'L1.1', description: 'Extract key information from short spoken audio (phone numbers, times, prices)' },
  { code: 'S1.1', description: 'Speak clearly to convey basic personal information and answer simple questions' },
];

async function main() {
  console.log('Seeding UK ESOL standard criteria...');
  for (const item of standardCriteria) {
    await prisma.criterion.upsert({
      where: { code: item.code },
      update: { description: item.description },
      create: { code: item.code, description: item.description },
    });
  }
  console.log('✅ Standard UK ESOL criteria seeded successfully.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
