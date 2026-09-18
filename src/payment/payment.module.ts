import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController, PaymentWebhookController } from './payment.controller';
import { PrismaModule } from 'src/database/prisma.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [PaymentService],
})
export class PaymentModule {}
