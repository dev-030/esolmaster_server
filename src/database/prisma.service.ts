import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './prisma-client/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
    constructor() {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL,
            max: Number(process.env.DATABASE_POOL_MAX ?? 10),
            connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5_000),
            idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
        });
        super({ adapter });
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
