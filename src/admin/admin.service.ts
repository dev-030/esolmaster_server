import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client/scripts/default-index.js';
import { PrismaService } from 'src/database/prisma.service';
import { AdminUsersQueryDto } from './dto/admin.dto';
import { Role } from 'src/database/prisma-client/enums';
import { PrismaClient } from 'src/database/prisma-client/internal/class';
import { User } from 'src/database/prisma-client/client';
import { UserWhereUniqueInput } from 'src/database/prisma-client/models';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const previousMonthEnd = currentMonthStart;

    const [
      totalUsers,
      previousTotalUsers,

      totalScheduledTasks,
      previousTotalScheduledTasks,

      completedScheduledTasks,
      previousCompletedScheduledTasks,

      newSignups,
      previousNewSignups,

      recentActivities,
    ] = await this.prisma.$transaction([
      // Total users till now
      this.prisma.user.count(),

      // Total users before current month
      this.prisma.user.count({
        where: {
          createdAt: {
            lt: currentMonthStart,
          },
        },
      }),

      // Scheduled tasks created this month
      this.prisma.classScheduledTask.count({
        where: {
          scheduledAt: {
            gte: currentMonthStart,
          },
        },
      }),

      // Scheduled tasks created previous month
      this.prisma.classScheduledTask.count({
        where: {
          scheduledAt: {
            gte: previousMonthStart,
            lt: previousMonthEnd,
          },
        },
      }),

      // Completed scheduled tasks by students this month
      this.prisma.attempt.count({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: currentMonthStart,
          },
        },
      }),

      // Completed scheduled tasks by students previous month
      this.prisma.attempt.count({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: previousMonthStart,
            lt: previousMonthEnd,
          },
        },
      }),

      // New signups this month
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: currentMonthStart,
          },
        },
      }),

      // New signups previous month
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: previousMonthStart,
            lt: previousMonthEnd,
          },
        },
      }),

      // Recent activity across all students
      this.prisma.studentActivity.findMany({
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          type: true,
          xpEarned: true,
          message: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      totalUsers: this.buildMetric(totalUsers, previousTotalUsers),

      totalScheduledTasks: this.buildMetric(
        totalScheduledTasks,
        previousTotalScheduledTasks,
      ),

      completedScheduledTasks: this.buildMetric(
        completedScheduledTasks,
        previousCompletedScheduledTasks,
      ),

      newSignups: this.buildMetric(newSignups, previousNewSignups),

      recentActivities: recentActivities.map((activity) => ({
        id: activity.id,
        name: `${activity.student.firstName} ${activity.student.lastName}`,
        xpEarned: activity.xpEarned,
        message: activity.message,
        type: activity.type,
      })),
    };
  }

  // service

  async getAllUsers(query: AdminUsersQueryDto) {
    const { page = 1, limit = 10, role, search } = query;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        {
          firstName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          lastName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [
      users,
      total,
      totalStudents,
      totalTeachers,
      activeUsers,
      inactiveUsers,
    ] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          student: true,
          teacher: true,
          _count: {
            select: {
              enrolledClasses: true,
              taughtClasses: true,
              attempts: true,
              tasks: true,
              studentBadges: true,
            },
          },
        },
        omit: {
          password: true,
        },
      }),

      this.prisma.user.count({ where }),

      this.prisma.user.count({
        where: { role: 'student' },
      }),

      this.prisma.user.count({
        where: { role: 'teacher' },
      }),

      this.prisma.user.count({
        where: { isActive: true },
      }),

      this.prisma.user.count({
        where: { isActive: false },
      }),
    ]);

    const data = users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,

      status: user.isActive ? 'Active' : 'Inactive',
      isActive: user.isActive,

      joinedAt: user.createdAt,

      lastActive:
        user.role === 'student' ? user.student?.lastActiveDate : user.updatedAt,

      avatarUrl: user.avatarUrl,

      relatedInfo:
        user.role === 'student'
          ? {
              username: user.student?.username,
              level: user.student?.level,
              totalXp: user.student?.totalXp,
              currentStreak: user.student?.currentStreak,
              longestStreak: user.student?.longestStreak,
              enrolledClasses: user._count.enrolledClasses,
              attempts: user._count.attempts,
              badges: user._count.studentBadges,
            }
          : {
              subject: user.teacher?.subject,
              institution: user.teacher?.institution,
              bio: user.teacher?.bio,
              classes: user._count.taughtClasses,
              tasksCreated: user._count.tasks,
            },
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      summary: {
        totalUsers: total,
        totalStudents,
        totalTeachers,
        activeUsers,
        inactiveUsers,
      },
    };
  }

  async getUserInfo(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      student: true,
      teacher: true,

      enrolledClasses: {
        select: {
          id: true,
          name: true,
          subject: true,
          color: true,
          createdAt: true,
        },
      },

      taughtClasses: {
        select: {
          id: true,
          name: true,
          subject: true,
          color: true,
          maxStudents: true,
          createdAt: true,
          _count: {
            select: {
              students: true,
              classTasks: true,
            },
          },
        },
      },

      studentMonthlyStats: {
        orderBy: [
          { year: 'asc' },
          { month: 'asc' },
        ],
        select: {
          month: true,
          year: true,
          completedTasks: true,
          grammarScoreAvg: true,
          readingScoreAvg: true,
          vocabularyScoreAvg: true,
          overallScoreAvg: true,
          xpEarned: true,
        },
      },

      studentSkillProgresses: {
        select: {
          skill: true,
          totalTasks: true,
          completedTasks: true,
          avgScore: true,
          totalScore: true,
          updatedAt: true,
        },
      },

      studentBadges: {
        take: 10,
        orderBy: {
          earnedAt: 'desc',
        },
        include: {
          badge: {
            select: {
              id: true,
              name: true,
              description: true,
              iconName: true,
            },
          },
        },
      },

      attempts: {
        take: 10,
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          isPassed: true,
          percentage: true,
          xpEarned: true,
          startedAt: true,
          completedAt: true,
          task: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
      },

      tasks: {
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          isPublic: true,
          createdAt: true,
          _count: {
            select: {
              questions: true,
              attempts: true,
            },
          },
        },
      },

      _count: {
        select: {
          enrolledClasses: true,
          taughtClasses: true,
          attempts: true,
          tasks: true,
          studentBadges: true,
          studentActivities: true,
        },
      },
    },
    omit: {
      password: true,
    },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const isStudent = user.role === 'student';

  return {
    role: user.role,

    profileCard: {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.isActive ? 'Active' : 'Inactive',
      isActive: user.isActive,
      isOnboarded: user.isOnboarded,
      joinedAt: user.createdAt,
      lastActive: isStudent ? user.student?.lastActiveDate : user.updatedAt,
    },

    statCards: isStudent
      ? [
          {
            label: 'Total XP',
            value: user.student?.totalXp ?? 0,
          },
          {
            label: 'Level',
            value: user.student?.level ?? 1,
          },
          {
            label: 'Completed Attempts',
            value: user.attempts.filter((attempt) => attempt.status === 'COMPLETED')
              .length,
          },
          {
            label: 'Badges',
            value: user._count.studentBadges,
          },
          {
            label: 'Current Streak',
            value: user.student?.currentStreak ?? 0,
          },
          {
            label: 'Longest Streak',
            value: user.student?.longestStreak ?? 0,
          },
        ]
      : [
          {
            label: 'Classes',
            value: user._count.taughtClasses,
          },
          {
            label: 'Tasks Created',
            value: user._count.tasks,
          },
          {
            label: 'Active Status',
            value: user.isActive ? 'Active' : 'Inactive',
          },
        ],

    roleInfo: isStudent
      ? {
          username: user.student?.username,
          totalXp: user.student?.totalXp ?? 0,
          level: user.student?.level ?? 1,
          currentStreak: user.student?.currentStreak ?? 0,
          longestStreak: user.student?.longestStreak ?? 0,
          lastActiveDate: user.student?.lastActiveDate,
        }
      : {
          subject: user.teacher?.subject,
          institution: user.teacher?.institution,
          bio: user.teacher?.bio,
        },

    chartData: isStudent
      ? {
          monthlyPerformance: user.studentMonthlyStats.map((item) => ({
            month: `${item.month}/${item.year}`,
            completedTasks: item.completedTasks,
            grammar: item.grammarScoreAvg,
            reading: item.readingScoreAvg,
            vocabulary: item.vocabularyScoreAvg,
            overall: item.overallScoreAvg,
            xp: item.xpEarned,
          })),

          skillProgress: user.studentSkillProgresses.map((item) => ({
            skill: item.skill,
            totalTasks: item.totalTasks,
            completedTasks: item.completedTasks,
            avgScore: item.avgScore,
            totalScore: item.totalScore,
          })),

          attemptPerformance: user.attempts.map((attempt) => ({
            taskTitle: attempt.task.title,
            taskType: attempt.task.type,
            percentage: attempt.percentage ?? 0,
            xpEarned: attempt.xpEarned,
            isPassed: attempt.isPassed,
            completedAt: attempt.completedAt,
          })),
        }
      : {
          taskCreation: user.tasks.map((task) => ({
            taskTitle: task.title,
            taskType: task.type,
            status: task.status,
            questions: task._count.questions,
            attempts: task._count.attempts,
            createdAt: task.createdAt,
          })),

          classOverview: user.taughtClasses.map((classItem) => ({
            className: classItem.name,
            subject: classItem.subject,
            students: classItem._count.students,
            tasks: classItem._count.classTasks,
            maxStudents: classItem.maxStudents,
          })),
        },

    tables: isStudent
      ? {
          enrolledClasses: user.enrolledClasses,

          recentAttempts: user.attempts.map((attempt) => ({
            id: attempt.id,
            taskTitle: attempt.task.title,
            taskType: attempt.task.type,
            status: attempt.status,
            percentage: attempt.percentage,
            xpEarned: attempt.xpEarned,
            isPassed: attempt.isPassed,
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
          })),

          badges: user.studentBadges.map((studentBadge) => ({
            id: studentBadge.id,
            badgeId: studentBadge.badge.id,
            name: studentBadge.badge.name,
            description: studentBadge.badge.description,
            iconName: studentBadge.badge.iconName,
            progress: studentBadge.progress,
            earnedAt: studentBadge.earnedAt,
          })),
        }
      : {
          classes: user.taughtClasses.map((classItem) => ({
            id: classItem.id,
            name: classItem.name,
            subject: classItem.subject,
            color: classItem.color,
            maxStudents: classItem.maxStudents,
            totalStudents: classItem._count.students,
            totalTasks: classItem._count.classTasks,
            createdAt: classItem.createdAt,
          })),

          recentTasks: user.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            type: task.type,
            status: task.status,
            isPublic: task.isPublic,
            totalQuestions: task._count.questions,
            totalAttempts: task._count.attempts,
            createdAt: task.createdAt,
          })),
        },
  };
}

async getPerformance() {
  const now = new Date();

  const last30DaysStart = new Date();
  last30DaysStart.setDate(now.getDate() - 30);

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);

  const [
    tasksCreatedLast30Days,
    tasksScheduledLast30Days,
    monthlyStats,
    teachers,
  ] = await this.prisma.$transaction([
    this.prisma.task.findMany({
      where: {
        createdAt: {
          gte: last30DaysStart,
          lte: now,
        },
      },
      select: {
        createdAt: true,
      },
    }),

    this.prisma.classScheduledTask.findMany({
      where: {
        scheduledAt: {
          gte: last30DaysStart,
          lte: now,
        },
      },
      select: {
        scheduledAt: true,
      },
    }),

    this.prisma.studentMonthlyStats.findMany({
      where: {
        year: now.getFullYear(),
      },
      select: {
        month: true,
        overallScoreAvg: true,
      },
      orderBy: {
        month: 'asc',
      },
    }),

    this.prisma.user.findMany({
      where: {
        role: 'teacher',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,

        taughtClasses: {
          select: {
            _count: {
              select: {
                students: true,
              },
            },
          },
        },

        tasks: {
          select: {
            id: true,
            attempts: {
              where: {
                status: 'COMPLETED',
                percentage: {
                  not: null,
                },
              },
              select: {
                percentage: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const weeklyActivityData = this.buildWeeklyActivityData(
    tasksCreatedLast30Days,
    tasksScheduledLast30Days,
  );

  const learnerProgressData = this.buildLearnerProgressData(monthlyStats);

  const topTeachers = teachers
    .map((teacher) => {
      const students = teacher.taughtClasses.reduce(
        (sum, classItem) => sum + classItem._count.students,
        0,
      );

      const allAttempts = teacher.tasks.flatMap((task) => task.attempts);

      const avgScore =
        allAttempts.length === 0
          ? 0
          : Math.round(
              allAttempts.reduce(
                (sum, attempt) => sum + (attempt.percentage ?? 0),
                0,
              ) / allAttempts.length,
            );

      return {
        id: teacher.id,
        name: `${teacher.firstName} ${teacher.lastName}`,
        avatar: teacher.avatarUrl ?? '',
        students,
        tasksCreated: teacher.tasks.length,
        avgScore,
      };
    })
    .sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      if (b.students !== a.students) return b.students - a.students;
      return b.tasksCreated - a.tasksCreated;
    })
    .slice(0, 5);

  return {
    range: {
      label: 'Last 30 days',
      from: last30DaysStart,
      to: now,
    },

    weeklyActivityData,

    learnerProgressData,

    topTeachers,
  };
}

private buildWeeklyActivityData(
  tasksCreated: { createdAt: Date }[],
  tasksScheduled: { scheduledAt: Date }[],
) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const data = days.map((day) => ({
    day,
    tasksCreated: 0,
    tasksScheduled: 0,
  }));

  for (const task of tasksCreated) {
    const day = days[task.createdAt.getDay()];
    const item = data.find((row) => row.day === day);

    if (item) {
      item.tasksCreated += 1;
    }
  }

  for (const scheduledTask of tasksScheduled) {
    const day = days[scheduledTask.scheduledAt.getDay()];
    const item = data.find((row) => row.day === day);

    if (item) {
      item.tasksScheduled += 1;
    }
  }

  return [
    data[1],
    data[2],
    data[3],
    data[4],
    data[5],
    data[6],
    data[0],
  ];
}

private buildLearnerProgressData(
  monthlyStats: { month: number; overallScoreAvg: number }[],
) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  return months.map((monthName, index) => {
    const monthNumber = index + 1;

    const statsForMonth = monthlyStats.filter(
      (item) => item.month === monthNumber,
    );

    const score =
      statsForMonth.length === 0
        ? 0
        : Math.round(
            statsForMonth.reduce(
              (sum, item) => sum + item.overallScoreAvg,
              0,
            ) / statsForMonth.length,
          );

    return {
      month: monthName,
      score,
    };
  });
}

async exportPerformanceData() {
  const performance = await this.getPerformance();

  const rows = [
    ['Section', 'Label', 'Value 1', 'Value 2', 'Value 3'],
  ];

  for (const item of performance.weeklyActivityData) {
    rows.push([
      'Weekly Activity',
      item.day,
      String(item.tasksCreated),
      String(item.tasksScheduled),
      '',
    ]);
  }

  for (const item of performance.learnerProgressData) {
    rows.push([
      'Learner Progress',
      item.month,
      String(item.score),
      '',
      '',
    ]);
  }

  for (const teacher of performance.topTeachers) {
    rows.push([
      'Top Teachers',
      teacher.name,
      String(teacher.students),
      String(teacher.tasksCreated),
      String(teacher.avgScore),
    ]);
  }

  return rows.map((row) => row.join(',')).join('\n');
}

// ── Reports page — one CSV export per real report type ──────────────────

private toCsv(rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((row) => row.map(escape).join(',')).join('\n');
}

async exportReport(type: string): Promise<string> {
  switch (type) {
    case 'user_activity':
      return this.exportUserActivityReport();
    case 'teacher_performance':
      return this.exportTeacherPerformanceReport();
    case 'learner_progress':
      return this.exportLearnerProgressReport();
    case 'task_log':
      return this.exportTaskLogReport();
    case 'platform_engagement':
      return this.exportPlatformEngagementReport();
    case 'revenue_subscriptions':
      return this.exportRevenueReport();
    default:
      throw new NotFoundException('Unknown report type');
  }
}

private async exportUserActivityReport() {
  const users = await this.prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const rows: (string | number)[][] = [
    ['Email', 'First Name', 'Last Name', 'Role', 'Active', 'Joined At'],
  ];
  for (const u of users) {
    rows.push([
      u.email,
      u.firstName,
      u.lastName,
      u.role,
      u.isActive ? 'Yes' : 'No',
      u.createdAt.toISOString(),
    ]);
  }
  return this.toCsv(rows);
}

private async exportTeacherPerformanceReport() {
  const performance = await this.getPerformance();
  const rows: (string | number)[][] = [
    ['Teacher', 'Students', 'Tasks Created', 'Avg Score'],
  ];
  for (const t of performance.topTeachers) {
    rows.push([t.name, t.students, t.tasksCreated, t.avgScore]);
  }
  return this.toCsv(rows);
}

private async exportLearnerProgressReport() {
  const performance = await this.getPerformance();
  const rows: (string | number)[][] = [['Month', 'Avg Score']];
  for (const m of performance.learnerProgressData) {
    rows.push([m.month, m.score]);
  }
  return this.toCsv(rows);
}

private async exportTaskLogReport() {
  const tasks = await this.prisma.task.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      title: true,
      type: true,
      status: true,
      isPublic: true,
      createdAt: true,
      createdBy: { select: { email: true } },
    },
  });

  const rows: (string | number)[][] = [
    ['Title', 'Type', 'Status', 'Public', 'Created By', 'Created At'],
  ];
  for (const t of tasks) {
    rows.push([
      t.title,
      t.type,
      t.status,
      t.isPublic ? 'Yes' : 'No',
      t.createdBy.email,
      t.createdAt.toISOString(),
    ]);
  }
  return this.toCsv(rows);
}

private async exportPlatformEngagementReport() {
  const analytics = await this.getPlatformAnalytics();
  const rows: (string | number)[][] = [['Metric', 'Value', 'Change %']];
  for (const card of analytics.statCards) {
    rows.push([card.title, card.value, card.change]);
  }
  rows.push([]);
  rows.push(['Day', 'Active Users', 'Task Completions']);
  for (const d of analytics.engagementData) {
    rows.push([d.day, d.activeUsers, d.taskCompletions]);
  }
  return this.toCsv(rows);
}

private async exportRevenueReport() {
  const subscriptions = await this.prisma.userSubscription.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true } },
      plan: { select: { name: true, type: true } },
    },
  });

  const rows: (string | number)[][] = [
    [
      'User Email',
      'Plan',
      'Billing Cycle',
      'Billing Status',
      'Final Price',
      'Current Period End',
    ],
  ];
  for (const s of subscriptions) {
    rows.push([
      s.user.email,
      s.plan.name,
      s.billingCycle ?? '',
      s.billingStatus,
      (s.finalPrice / 100).toFixed(2),
      s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : '',
    ]);
  }
  return this.toCsv(rows);
}

async getPlatformAnalytics() {
  const now = new Date();

  const currentStart = new Date();
  currentStart.setDate(now.getDate() - 30);

  const previousStart = new Date();
  previousStart.setDate(now.getDate() - 60);

  const previousEnd = currentStart;

  const [
    activeUsers,
    previousActiveUsers,

    totalTeachers,
    previousTotalTeachers,

    totalStudents,
    previousTotalStudents,

    activitiesLast30Days,
    completedAttemptsLast30Days,

    popularTasks,
  ] = await this.prisma.$transaction([
    this.prisma.user.count({
      where: {
        isActive: true,
      },
    }),

    this.prisma.user.count({
      where: {
        isActive: true,
        createdAt: {
          lt: previousEnd,
        },
      },
    }),

    this.prisma.user.count({
      where: {
        role: 'teacher',
      },
    }),

    this.prisma.user.count({
      where: {
        role: 'teacher',
        createdAt: {
          lt: previousEnd,
        },
      },
    }),

    this.prisma.user.count({
      where: {
        role: 'student',
      },
    }),

    this.prisma.user.count({
      where: {
        role: 'student',
        createdAt: {
          lt: previousEnd,
        },
      },
    }),

    this.prisma.studentActivity.findMany({
      where: {
        createdAt: {
          gte: currentStart,
          lte: now,
        },
      },
      select: {
        studentId: true,
        createdAt: true,
      },
    }),

    this.prisma.attempt.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: currentStart,
          lte: now,
        },
      },
      select: {
        id: true,
        completedAt: true,
      },
    }),

    this.prisma.task.findMany({
      take: 7,
      orderBy: {
        attempts: {
          _count: 'desc',
        },
      },
      select: {
        id: true,
        title: true,
        _count: {
          select: {
            attempts: true,
          },
        },
      },
    }),
  ]);

  return {
    range: {
      label: 'Last 30 days',
      from: currentStart,
      to: now,
    },

    statCards: [
      {
        title: 'Total Active Users',
        value: activeUsers,
        change: this.getPercentageChange(activeUsers, previousActiveUsers),
      },
      {
        title: 'Total Teachers',
        value: totalTeachers,
        change: this.getPercentageChange(totalTeachers, previousTotalTeachers),
      },
      {
        title: 'Total Students',
        value: totalStudents,
        change: this.getPercentageChange(totalStudents, previousTotalStudents),
      },
    ],

    engagementData: this.buildEngagementData(
      activitiesLast30Days,
      completedAttemptsLast30Days,
    ),

    popularTasksData: popularTasks.map((task) => ({
      name: task.title,
      completions: task._count.attempts,
    })),
  };
}
  private buildMetric(current: number, previous: number) {
    let changePercentage = 0;

    if (previous === 0 && current > 0) {
      changePercentage = 100;
    } else if (previous > 0) {
      changePercentage = ((current - previous) / previous) * 100;
    }

    return {
      value: current,
      previousValue: previous,
      changePercentage: Math.abs(Number(changePercentage.toFixed(2))),
      direction:
        current > previous
          ? 'increase'
          : current < previous
            ? 'decrease'
            : 'neutral',
    };
  }
  private getPercentageChange(current: number, previous: number) {
  if (previous === 0 && current > 0) return 100;
  if (previous === 0 && current === 0) return 0;

  return Number((((current - previous) / previous) * 100).toFixed(1));
}
private buildEngagementData(
  activities: { studentId: string; createdAt: Date }[],
  completions: { id: string; completedAt: Date | null }[],
) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const data = days.map((day) => ({
    day,
    activeUsers: 0,
    taskCompletions: 0,
    activeUserIds: new Set<string>(),
  }));

  for (const activity of activities) {
    const day = days[activity.createdAt.getDay()];
    const item = data.find((row) => row.day === day);

    if (item) {
      item.activeUserIds.add(activity.studentId);
    }
  }

  for (const completion of completions) {
    if (!completion.completedAt) continue;

    const day = days[completion.completedAt.getDay()];
    const item = data.find((row) => row.day === day);

    if (item) {
      item.taskCompletions += 1;
    }
  }

  const ordered = [
    data[1],
    data[2],
    data[3],
    data[4],
    data[5],
    data[6],
    data[0],
  ];

  return ordered.map((item) => ({
    day: item.day,
    activeUsers: item.activeUserIds.size,
    taskCompletions: item.taskCompletions,
  }));
}
}
