import { Module } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { PrismaModule } from 'src/database/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [PrismaModule, MailModule, NotificationModule],
  providers: [ReminderService],
})
export class ReminderModule {}
