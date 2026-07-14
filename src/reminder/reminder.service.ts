import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/database/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { NotificationService } from 'src/notification/notification.service';

const TASK_ENDING_SOON_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours
const SUBSCRIPTION_EXPIRING_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * A scheduled task became available (scheduledAt reached) — notify every
   * enrolled student once. Runs every 10 minutes; dedup via openedNotifiedAt.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async notifyTasksOpened() {
    const now = new Date();

    const scheduledTasks = await this.prisma.classScheduledTask.findMany({
      where: {
        isActive: true,
        scheduledAt: { lte: now },
        openedNotifiedAt: null,
      },
      include: {
        classTask: {
          include: {
            class: { include: { students: { select: { id: true } } } },
            task: { select: { title: true, type: true } },
          },
        },
      },
    });

    for (const scheduledTask of scheduledTasks) {
      const studentIds = scheduledTask.classTask.class.students.map(
        (s) => s.id,
      );

      if (studentIds.length) {
        const title = 'New task available';
        const message = `"${scheduledTask.classTask.task.title}" is now open in ${scheduledTask.classTask.class.name}.`;

        await this.notificationService.createMany(
          studentIds,
          'TASK_OPENED',
          title,
          message,
          scheduledTask.id,
        );

        await this.emailStudents(studentIds, title, message);
      }

      await this.prisma.classScheduledTask.update({
        where: { id: scheduledTask.id },
        data: { openedNotifiedAt: now },
      });
    }

    if (scheduledTasks.length) {
      this.logger.log(`Notified ${scheduledTasks.length} newly-opened task(s)`);
    }
  }

  /**
   * A scheduled task's due date is within the reminder window — notify
   * enrolled students who have not yet completed it. Runs every 10 minutes;
   * dedup via endingSoonNotifiedAt.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async notifyTasksEndingSoon() {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + TASK_ENDING_SOON_WINDOW_MS);

    const scheduledTasks = await this.prisma.classScheduledTask.findMany({
      where: {
        isActive: true,
        dueAt: { gt: now, lte: windowEnd },
        endingSoonNotifiedAt: null,
      },
      include: {
        classTask: {
          include: {
            class: { include: { students: { select: { id: true } } } },
            task: { select: { title: true } },
          },
        },
        attempts: {
          where: { status: 'COMPLETED' },
          select: { studentId: true },
        },
      },
    });

    for (const scheduledTask of scheduledTasks) {
      const completedStudentIds = new Set(
        scheduledTask.attempts.map((a) => a.studentId),
      );
      const pendingStudentIds = scheduledTask.classTask.class.students
        .map((s) => s.id)
        .filter((id) => !completedStudentIds.has(id));

      if (pendingStudentIds.length) {
        const title = 'Task ending soon';
        const message = `"${scheduledTask.classTask.task.title}" in ${scheduledTask.classTask.class.name} is due soon — finish it before it closes.`;

        await this.notificationService.createMany(
          pendingStudentIds,
          'TASK_ENDING_SOON',
          title,
          message,
          scheduledTask.id,
        );

        await this.emailStudents(pendingStudentIds, title, message);
      }

      await this.prisma.classScheduledTask.update({
        where: { id: scheduledTask.id },
        data: { endingSoonNotifiedAt: now },
      });
    }

    if (scheduledTasks.length) {
      this.logger.log(
        `Sent ending-soon reminders for ${scheduledTasks.length} task(s)`,
      );
    }
  }

  /**
   * A teacher's paid subscription period is ending within the reminder
   * window — notify + email them. Runs hourly; dedup by comparing
   * expiryNotifiedAt against the current period start (so it re-fires each
   * renewal cycle).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async notifySubscriptionsExpiring() {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + SUBSCRIPTION_EXPIRING_WINDOW_MS);

    const candidates = await this.prisma.userSubscription.findMany({
      where: {
        billingStatus: { in: ['ACTIVE', 'TRIALING', 'CANCELING'] },
        currentPeriodEnd: { gt: now, lte: windowEnd },
      },
      include: {
        user: { select: { id: true, email: true, firstName: true } },
        plan: { select: { name: true } },
      },
    });

    const due = candidates.filter(
      (sub) =>
        !sub.expiryNotifiedAt ||
        !sub.currentPeriodStart ||
        sub.expiryNotifiedAt < sub.currentPeriodStart,
    );

    for (const sub of due) {
      const endDate = sub.currentPeriodEnd!.toLocaleDateString();
      const title = 'Your subscription is expiring soon';
      const message = `Your ${sub.plan.name} package renews or ends on ${endDate}. ${
        sub.cancelAtPeriodEnd
          ? 'It is set to cancel — renew to keep your premium tasks and class limits.'
          : 'Make sure your payment method is up to date to avoid interruption.'
      }`;

      await this.notificationService.create(
        sub.user.id,
        'SUBSCRIPTION_EXPIRING',
        title,
        message,
        sub.id,
      );

      await this.mailService.sendNotificationMail(
        sub.user.email,
        title,
        title,
        message,
      );

      await this.prisma.userSubscription.update({
        where: { id: sub.id },
        data: { expiryNotifiedAt: now },
      });
    }

    if (due.length) {
      this.logger.log(`Sent expiry reminders to ${due.length} subscriber(s)`);
    }
  }

  private async emailStudents(
    studentIds: string[],
    title: string,
    message: string,
  ) {
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { email: true },
    });

    await Promise.all(
      students.map((s) =>
        this.mailService.sendNotificationMail(s.email, title, title, message),
      ),
    );
  }
}
