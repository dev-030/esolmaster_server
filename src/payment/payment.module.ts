import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController, PaymentWebhookController } from './payment.controller';
import { PrismaModule } from 'src/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [PaymentService],
})
export class PaymentModule {}
