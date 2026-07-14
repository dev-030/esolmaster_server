import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './database/prisma.module';
import { MailModule } from './mail/mail.module';
import { GuardModule } from './guards/guard.module';
import { TaskModule } from './task/task.module';
import { UploadModule } from './upload/upload.module';
import { ClassModule } from './class/class.module';
import { AttemptModule } from './attempt/attempt.module';
import { CriteriaModule } from './criteria/criteria.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { StudentModule } from './student/student.module';
import { BadgeModule } from './badge/badge.module';
import { AdminModule } from './admin/admin.module';
import { PaymentModule } from './payment/payment.module';
import { NotificationModule } from './notification/notification.module';
import { ReminderModule } from './reminder/reminder.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
  }), ScheduleModule.forRoot(), AuthModule, PrismaModule, MailModule, GuardModule, TaskModule, UploadModule, ClassModule, AttemptModule, CriteriaModule, AnalyticsModule, StudentModule, BadgeModule, AdminModule, PaymentModule, NotificationModule, ReminderModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
