import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client/scripts/default-index.js';
import { PrismaService } from 'src/database/prisma.service';
import { TaskType } from 'src/task/dto/task.dto';
import { ScheduledTaskQueryDto } from './dto/student..dto';
import { calculateLevel } from 'common/utils/calculationxp';

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(studentId: string) {
    const now = new Date();

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const startOfPreviousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const endOfPreviousMonth = startOfCurrentMonth;

    // Get student profile
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
    });

    // Get student's classes
    const classes = await this.prisma.class.findMany({
      where: {
        students: {
          some: { id: studentId },
        },
      },
      select: { id: true },
    });

    const classIds = classes.map((c) => c.id);

    // Scheduled tasks current month
    const scheduledCurrent = await this.prisma.classScheduledTask.count({
      where: {
        scheduledAt: {
          gte: startOfCurrentMonth,
          lt: startOfNextMonth,
        },
        classTask: {
          classId: { in: classIds },
        },
      },
    });

    // Scheduled tasks previous month
    const scheduledPrevious = await this.prisma.classScheduledTask.count({
      where: {
        scheduledAt: {
          gte: startOfPreviousMonth,
          lt: endOfPreviousMonth,
        },
        classTask: {
          classId: { in: classIds },
        },
      },
    });

    // Completed tasks current month
    const completedCurrent = await this.prisma.attempt.count({
      where: {
        studentId,
        status: 'COMPLETED',
        completedAt: {
          gte: startOfCurrentMonth,
          lt: startOfNextMonth,
        },
      },
    });

    // Completed tasks previous month
    const completedPrevious = await this.prisma.attempt.count({
      where: {
        studentId,
        status: 'COMPLETED',
        completedAt: {
          gte: startOfPreviousMonth,
          lt: endOfPreviousMonth,
        },
      },
    });

    // XP current month
    const xpCurrent = await this.prisma.attempt.aggregate({
      where: {
        studentId,
        completedAt: {
          gte: startOfCurrentMonth,
          lt: startOfNextMonth,
        },
      },
      _sum: { xpEarned: true },
    });

    // XP previous month
    const xpPrevious = await this.prisma.attempt.aggregate({
      where: {
        studentId,
        completedAt: {
          gte: startOfPreviousMonth,
          lt: endOfPreviousMonth,
        },
      },
      _sum: { xpEarned: true },
    });

    const xpCurrentValue = xpCurrent._sum.xpEarned ?? 0;
    const xpPreviousValue = xpPrevious._sum.xpEarned ?? 0;

    // Percentage change calculator
    const calcChange = (current: number, previous: number) => {
      if (previous === 0) {
        return {
          changePercentage: current > 0 ? 100 : 0,
          trend: current > 0 ? 'increase' : 'neutral',
        };
      }

      const percentage = Math.round(
        (Math.abs(current - previous) / previous) * 100,
      );

      const trend =
        current > previous
          ? 'increase'
          : current < previous
            ? 'decrease'
            : 'neutral';

      return {
        changePercentage: percentage,
        trend,
      };
    };

    const scheduledChange = calcChange(scheduledCurrent, scheduledPrevious);
    const completedChange = calcChange(completedCurrent, completedPrevious);
    const xpChange = calcChange(xpCurrentValue, xpPreviousValue);

    // Level calculation
    // const xpPerLevel = 200;
    // const totalXp = profile?.totalXp ?? 0;

    // const level = Math.floor(totalXp / xpPerLevel) + 1;
    // const xpIntoLevel = totalXp % xpPerLevel;
    // const xpNeededForNextLevel = xpPerLevel - xpIntoLevel;
    const levelData = calculateLevel(profile?.totalXp ?? 0);

    // Recent activity (unchanged)
    const activities = await this.prisma.studentActivity.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        scheduledTask: {
          include: {
            classTask: {
              include: {
                task: true,
                class: true,
              },
            },
          },
        },
      },
    });

    return {
      stats: {
        totalScheduledTasks: {
          currentMonth: scheduledCurrent,
          ...scheduledChange,
        },
        completedTasks: {
          currentMonth: completedCurrent,
          ...completedChange,
        },
        xpEarned: {
          currentMonth: xpCurrentValue,
          ...xpChange,
        },
        currentStreak: profile?.currentStreak ?? 0,
      },

      level: {
        level: levelData.level,
        totalXp: profile?.totalXp ?? 0,
        xpIntoLevel: levelData.xpIntoLevel,
        xpNeededForNextLevel: levelData.xpNeededForNextLevel,
      },

      recentActivity: activities.map((a) => ({
        id: a.id,
        xpEarned: a.xpEarned,
        taskTitle: a.scheduledTask?.classTask?.task?.title,
        taskType: a.scheduledTask?.classTask?.task?.type,
        className: a.scheduledTask?.classTask?.class?.name,
        createdAt: a.createdAt,
      })),
    };
  }

  async getProgress(studentId: string) {
    // Find student classes
    const classes = await this.prisma.class.findMany({
      where: {
        students: {
          some: { id: studentId },
        },
      },
      select: { id: true },
    });

    const classIds = classes.map((c) => c.id);

    // Get scheduled tasks by type
    const scheduled = await this.prisma.classScheduledTask.findMany({
      where: {
        classTask: {
          classId: { in: classIds },
        },
      },
      include: {
        classTask: {
          include: {
            task: true,
          },
        },
      },
    });

    const totals = {
      GRAMMAR: 0,
      READING: 0,
      VOCABULARY: 0,
    };

    scheduled.forEach((s) => {
      const type = s.classTask.task.type;
      totals[type]++;
    });

    // Get completed attempts
    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        status: 'COMPLETED',
      },
      include: {
        task: true,
      },
    });

    const completed = {
      GRAMMAR: 0,
      READING: 0,
      VOCABULARY: 0,
    };

    attempts.forEach((a) => {
      completed[a.task.type]++;
    });

    const calc = (done: number, total: number) =>
      total > 0 ? Math.round((done / total) * 100) : 0;

    const grammar = calc(completed.GRAMMAR, totals.GRAMMAR);
    const reading = calc(completed.READING, totals.READING);
    const vocabulary = calc(completed.VOCABULARY, totals.VOCABULARY);

    const overall = calc(
      completed.GRAMMAR + completed.READING + completed.VOCABULARY,
      totals.GRAMMAR + totals.READING + totals.VOCABULARY,
    );

    return {
      grammar,
      reading,
      vocabulary,
      overall,
    };
  }

  async getRecentActivity(studentId: string) {
    const activities = await this.prisma.studentActivity.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        scheduledTask: {
          include: {
            classTask: {
              include: {
                task: true,
                class: true,
              },
            },
          },
        },
      },
    });

    return activities.map((a) => ({
      id: a.id,
      type: a.type,
      xpEarned: a.xpEarned,
      taskTitle: a.scheduledTask?.classTask?.task?.title,
      className: a.scheduledTask?.classTask?.class?.name,
      createdAt: a.createdAt,
    }));
  }

  async getScoreTrend(studentId: string) {
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        status: 'COMPLETED',
        completedAt: {
          gte: sixWeeksAgo,
        },
      },
      include: {
        task: true,
      },
    });

    const weeks: any = {
      W1: { Grammar: [], Reading: [], Vocabulary: [] },
      W2: { Grammar: [], Reading: [], Vocabulary: [] },
      W3: { Grammar: [], Reading: [], Vocabulary: [] },
      W4: { Grammar: [], Reading: [], Vocabulary: [] },
      W5: { Grammar: [], Reading: [], Vocabulary: [] },
      W6: { Grammar: [], Reading: [], Vocabulary: [] },
    };

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 42);

    attempts.forEach((a) => {
      const completedAt = a.completedAt;
      if (!completedAt) return;

      const diffDays =
        (new Date(completedAt).getTime() - startDate.getTime()) /
        (1000 * 60 * 60 * 24);

      const weekIndex = Math.floor(diffDays / 7);

      if (weekIndex < 0 || weekIndex > 5) return;

      const weekKey = `W${weekIndex + 1}`;

      const score = a.percentage ?? 0;

      if (a.task.type === 'GRAMMAR') weeks[weekKey].Grammar.push(score);
      if (a.task.type === 'READING') weeks[weekKey].Reading.push(score);
      if (a.task.type === 'VOCABULARY') weeks[weekKey].Vocabulary.push(score);
    });

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    return Object.entries(weeks).map(([week, values]: any) => ({
      week,
      Grammar: avg(values.Grammar),
      Reading: avg(values.Reading),
      Vocabulary: avg(values.Vocabulary),
    }));
  }

 async getScheduledTasks(studentId: string, query: ScheduledTaskQueryDto) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const skip = (page - 1) * limit ;

  const { taskType, entryType } = query;

  if (entryType && taskType === TaskType.VOCABULARY) {
    throw new BadRequestException(
      'entryType filter is only available for GRAMMAR and READING tasks',
    );
  }

  const taskWhere = {
    ...(taskType && {
      type: taskType,
    }),

    ...(entryType &&
      taskType === TaskType.GRAMMAR && {
        grammarContent: {
          entryType: {
            has: entryType,
          },
        },
      }),

    ...(entryType &&
      taskType === TaskType.READING && {
        readingContent: {
          entryType: {
            has: entryType,
          },
        },
      }),

    ...(entryType &&
      !taskType && {
        OR: [
          {
            type: TaskType.GRAMMAR,
            grammarContent: {
              entryType: {
                has: entryType,
              },
            },
          },
          {
            type: TaskType.READING,
            readingContent: {
              entryType: {
                has: entryType,
              },
            },
          },
        ],
      }),
  };

  const where = {
    scheduledTask: {
      isNot: null,
    },
    class: {
      students: {
        some: {
          id: studentId,
        },
      },
    },
    task: taskWhere,
  };

  const [total, classTasks] = await this.prisma.$transaction([
    this.prisma.classTask.count({ where }),

    this.prisma.classTask.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        scheduledTask: {
          scheduledAt: 'desc',
        },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            subject: true,
            color: true,
          },
        },
      scheduledTask: {
  include: {
    attempts: {
      where: {
        studentId,
      },
      select: {
        status: true,
      },
      take: 1,
    },
  },
},
task: {
  include: {
    grammarContent: true,
    readingContent: true,
    vocabularyItems: true,
    questions: {
      select: {
        type: true,
      },
    },
    _count: {
      select: {
        questions: true,
      },
    },
    attempts: {
      where: {
        studentId,
      },
      select: {
        status: true,
      },
      take: 1,
    },
  },
},
      },
    }),
  ]);

  return {
data: classTasks.map((ct) => ({
  classId: ct.class.id,
  className: ct.class.name,
  classSubject: ct.class.subject,
  entryType: ct.task.type === TaskType.GRAMMAR
    ? ct.task.grammarContent?.entryType
    : ct.task.type === TaskType.READING
      ? ct.task.readingContent?.entryType
      : null,

  classTaskId: ct.id,
  scheduledTaskId: ct.scheduledTask?.id,
  attemptStatus: ct.scheduledTask?. attempts[0]?.status ?? null,

  taskId: ct.task.id,
  taskTitle: ct.task.title,
  taskType: ct.task.type,
  taskStatus: ct.task.status,

  xpPerQuestion: ct.task.xpPerQuestion,
  totalQuestions: ct.task._count.questions,
  totalXp: ct.task._count.questions * ct.task.xpPerQuestion,

  questionTypes: [...new Set(ct.task.questions.map((q) => q.type))],

  scheduledAt: ct.scheduledTask?.scheduledAt,
  dueAt: ct.scheduledTask?.dueAt,
  isActive: ct.scheduledTask?.isActive,
})),

    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
}

  async getSkillDistribution(studentId: string) {
    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        status: 'COMPLETED',
      },
      include: {
        task: true,
      },
    });

    const counts = {
      GRAMMAR: 0,
      READING: 0,
      VOCABULARY: 0,
    };

    attempts.forEach((a) => {
      if (a.task.type === 'GRAMMAR') counts.GRAMMAR++;
      if (a.task.type === 'READING') counts.READING++;
      if (a.task.type === 'VOCABULARY') counts.VOCABULARY++;
    });

    const total = counts.GRAMMAR + counts.READING + counts.VOCABULARY;

    const calc = (value: number) =>
      total > 0 ? Math.round((value / total) * 100) : 0;

    return [
      {
        name: 'Grammar',
        value: calc(counts.GRAMMAR),
        color: '#4F46E5',
      },
      {
        name: 'Reading',
        value: calc(counts.READING),
        color: '#10B981',
      },
      {
        name: 'Vocabulary',
        value: calc(counts.VOCABULARY),
        color: '#F59E0B',
      },
    ];
  }
}
