import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus } from 'src/database/prisma-client/enums';
import { PrismaService } from 'src/database/prisma.service';
import { TeacherStudentsProgressQueryDto } from './dto/anaylytics.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllStudentsProgress(
    teacherId: string,
    query: TeacherStudentsProgressQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const classes = await this.prisma.class.findMany({
      where: {
        teacherId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                {
                  students: {
                    some: {
                      OR: [
                        {
                          firstName: { contains: search, mode: 'insensitive' },
                        },
                        { lastName: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        students: {
          where: search
            ? {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  {
                    enrolledClasses: {
                      some: {
                        name: { contains: search, mode: 'insensitive' },
                      },
                    },
                  },
                ],
              }
            : undefined,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        classTasks: {
          where: {
            scheduledTask: {
              isNot: null,
            },
          },
          select: {
            scheduledTask: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    const studentMap = new Map<
      string,
      {
        studentId: string;
        name: string;
        email: string;
        connectedClasses: { id: string; name: string }[];
        scheduledTaskIds: Set<string>;
      }
    >();

    for (const classItem of classes) {
      const scheduledTaskIds = classItem.classTasks
        .map((classTask) => classTask.scheduledTask?.id)
        .filter(Boolean) as string[];

      for (const student of classItem.students) {
        if (!studentMap.has(student.id)) {
          studentMap.set(student.id, {
            studentId: student.id,
            name: `${student.firstName} ${student.lastName}`,
            email: student.email,
            connectedClasses: [],
            scheduledTaskIds: new Set(),
          });
        }

        const existing = studentMap.get(student.id)!;

        const alreadyAddedClass = existing.connectedClasses.some(
          (classData) => classData.id === classItem.id,
        );

        if (!alreadyAddedClass) {
          existing.connectedClasses.push({
            id: classItem.id,
            name: classItem.name,
          });
        }

        scheduledTaskIds.forEach((id) => existing.scheduledTaskIds.add(id));
      }
    }

    const allStudentsBeforePagination = Array.from(studentMap.values());

    const total = allStudentsBeforePagination.length;
    const totalPages = Math.ceil(total / limit);

    const paginatedStudentsBase = allStudentsBeforePagination.slice(
      skip,
      skip + limit,
    );

    const paginatedStudentIds = paginatedStudentsBase.map(
      (student) => student.studentId,
    );

    const paginatedScheduledTaskIds = Array.from(
      new Set(
        paginatedStudentsBase.flatMap((student) =>
          Array.from(student.scheduledTaskIds),
        ),
      ),
    );

    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId: {
          in: paginatedStudentIds,
        },
        scheduledTaskId: {
          in: paginatedScheduledTaskIds,
        },
      },
      select: {
        studentId: true,
        scheduledTaskId: true,
        status: true,
        score: true,
        completedAt: true,
      },
    });

    const students = paginatedStudentsBase.map((student) => {
      const studentScheduledTaskIds = Array.from(student.scheduledTaskIds);

      const studentAttempts = attempts.filter(
        (attempt) =>
          attempt.studentId === student.studentId &&
          studentScheduledTaskIds.includes(attempt.scheduledTaskId),
      );

      const completedAttempts = studentAttempts.filter(
        (attempt) => attempt.status === AttemptStatus.COMPLETED,
      );

      const inProgressAttempts = studentAttempts.filter(
        (attempt) => attempt.status === AttemptStatus.IN_PROGRESS,
      );

      const totalScheduledTasks = studentScheduledTaskIds.length;
      const completedTasks = completedAttempts.length;
      const inProgressTasks = inProgressAttempts.length;

      const notStartedTasks =
        totalScheduledTasks - completedTasks - inProgressTasks;

      const progressPercentage =
        totalScheduledTasks === 0
          ? 0
          : Math.round((completedTasks / totalScheduledTasks) * 100);

      const avgScore =
        completedTasks === 0
          ? 0
          : Math.round(
              completedAttempts.reduce(
                (sum, attempt) => sum + attempt.score,
                0,
              ) / completedTasks,
            );

      const status =
        avgScore < 60 ? 'PROBLEMATIC' : avgScore < 80 ? 'AVERAGE' : 'GOOD';

      const lastAttemptAt =
        completedAttempts
          .map((attempt) => attempt.completedAt)
          .filter(Boolean)
          .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

      return {
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        connectedClasses: student.connectedClasses,

        totalScheduledTasks,
        completedTasks,
        inProgressTasks,
        notStartedTasks: Math.max(notStartedTasks, 0),

        progressPercentage,
        avgScore,
        status,
        lastAttemptAt,
      };
    });

    return {
      data: students,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getStudentPerformanceDetails(teacherId: string, studentId: string) {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const teacherClasses = await this.prisma.class.findMany({
      where: {
        teacherId,
        students: {
          some: {
            id: studentId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        classTasks: {
          where: {
            scheduledTask: {
              isNot: null,
            },
          },
          select: {
            scheduledTask: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!teacherClasses.length) {
      throw new NotFoundException(
        'Student not found or not connected to your classes',
      );
    }

    const student = await this.prisma.user.findUnique({
      where: {
        id: studentId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const scheduledTaskIds = teacherClasses.flatMap((classItem) =>
      classItem.classTasks
        .map((classTask) => classTask.scheduledTask?.id)
        .filter(Boolean),
    ) as string[];

    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        scheduledTaskId: {
          in: scheduledTaskIds,
        },
      },
      select: {
        id: true,
        status: true,
        score: true,
        achievedCriteria: true,
        missingCriteria: true,
        startedAt: true,
        completedAt: true,
        scheduledTask: {
          select: {
            classTask: {
              select: {
                task: {
                  select: {
                    id: true,
                    title: true,
                    type: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const completedAttempts = attempts.filter(
      (attempt) => attempt.status === AttemptStatus.COMPLETED,
    );

    const totalScheduledTasks = scheduledTaskIds.length;
    const completedTasks = completedAttempts.length;
    const inProgressTasks = attempts.filter(
      (attempt) => attempt.status === AttemptStatus.IN_PROGRESS,
    ).length;

    const progressPercentage =
      totalScheduledTasks === 0
        ? 0
        : Math.round((completedTasks / totalScheduledTasks) * 100);

    const avgScore =
      completedTasks === 0
        ? 0
        : Math.round(
            completedAttempts.reduce((sum, attempt) => sum + attempt.score, 0) /
              completedTasks,
          );

    const status =
      avgScore < 60 ? 'PROBLEMATIC' : avgScore < 80 ? 'AVERAGE' : 'GOOD';

    const lastThreeMonthsAttempts = completedAttempts.filter(
      (attempt) => attempt.completedAt && attempt.completedAt >= threeMonthsAgo,
    );

    const months = Array.from({ length: 3 }).map((_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (2 - index));

      return {
        month: date.toLocaleString('default', { month: 'short' }),
        monthIndex: date.getMonth(),
        year: date.getFullYear(),
      };
    });

    const categories = ['READING', 'VOCABULARY', 'GRAMMAR'];

    const lastThreeMonthsPerformance = categories.reduce(
      (acc, category) => {
        acc[category.toLowerCase()] = months.map((month) => {
          const categoryMonthAttempts = lastThreeMonthsAttempts.filter(
            (attempt) => {
              const completedAt = attempt.completedAt!;
              const taskType = attempt.scheduledTask.classTask.task.type;

              return (
                taskType === category &&
                completedAt.getMonth() === month.monthIndex &&
                completedAt.getFullYear() === month.year
              );
            },
          );

          const completedTasks = categoryMonthAttempts.length;

          const avgScore =
            completedTasks === 0
              ? 0
              : Math.round(
                  categoryMonthAttempts.reduce(
                    (sum, attempt) => sum + attempt.score,
                    0,
                  ) / completedTasks,
                );

          return {
            month: month.month,
            avgScore,
            completedTasks,
          };
        });

        return acc;
      },
      {} as Record<string, any[]>,
    );

    const skillMap = new Map<
      string,
      {
        criterionCode: string;
        achievedCount: number;
        missingCount: number;
      }
    >();

    for (const attempt of completedAttempts) {
      for (const code of attempt.achievedCriteria) {
        if (!skillMap.has(code)) {
          skillMap.set(code, {
            criterionCode: code,
            achievedCount: 0,
            missingCount: 0,
          });
        }

        skillMap.get(code)!.achievedCount++;
      }

      for (const code of attempt.missingCriteria) {
        if (!skillMap.has(code)) {
          skillMap.set(code, {
            criterionCode: code,
            achievedCount: 0,
            missingCount: 0,
          });
        }

        skillMap.get(code)!.missingCount++;
      }
    }

    const lifetimeSkillBreakdown = Array.from(skillMap.values()).map(
      (skill) => {
        const total = skill.achievedCount + skill.missingCount;

        return {
          criterionCode: skill.criterionCode,
          achievedCount: skill.achievedCount,
          missingCount: skill.missingCount,
          percentage:
            total === 0 ? 0 : Math.round((skill.achievedCount / total) * 100),
        };
      },
    );

    return {
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
        connectedClasses: teacherClasses.map((classItem) => ({
          id: classItem.id,
          name: classItem.name,
        })),
      },
      summary: {
        totalScheduledTasks,
        completedTasks,
        inProgressTasks,
        notStartedTasks: Math.max(
          totalScheduledTasks - completedTasks - inProgressTasks,
          0,
        ),
        progressPercentage,
        avgScore,
        status,
      },
      lastThreeMonthsPerformance,
      lifetimeSkillBreakdown,
    };
  }

  async getReportsOverview(teacherId: string) {
    const teacherClasses = await this.prisma.class.findMany({
      where: {
        teacherId,
      },
      select: {
        id: true,
        students: {
          select: {
            id: true,
          },
        },
        classTasks: {
          where: {
            scheduledTask: {
              isNot: null,
            },
          },
          select: {
            scheduledTask: {
              select: {
                id: true,
                scheduledAt: true,
              },
            },
          },
        },
      },
    });

    const classIds = teacherClasses.map((item) => item.id);

    const scheduledTasks = teacherClasses.flatMap((classItem) =>
      classItem.classTasks.map((task) => task.scheduledTask).filter(Boolean),
    );

    const scheduledTaskIds = scheduledTasks
      .map((task) => task?.id)
      .filter((id) => id !== undefined) as string[];

    const attempts = await this.prisma.attempt.findMany({
      where: {
        scheduledTaskId: {
          in: scheduledTaskIds,
        },
        status: AttemptStatus.COMPLETED,
      },
      select: {
        studentId: true,
        score: true,
        completedAt: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const currentYear = new Date().getFullYear();

    const yearlyTaskPerformance = [
      {
        year: currentYear,
        totalClasses: classIds.length,
        totalScheduledTasks: scheduledTaskIds.length,
        totalCompletedAttempts: attempts.length,
      },
    ];

    const monthlyTaskCompletionRate = Array.from({ length: 12 }).map(
      (_, index) => {
        const monthAttempts = attempts.filter(
          (attempt) =>
            attempt.completedAt &&
            attempt.completedAt.getMonth() === index &&
            attempt.completedAt.getFullYear() === currentYear,
        );

        const monthName = new Date(currentYear, index, 1).toLocaleString(
          'default',
          {
            month: 'short',
          },
        );

        const totalCompleted = monthAttempts.length;

        const totalAssigned = scheduledTasks.filter(
          (task) =>
            task?.scheduledAt?.getMonth() === index &&
            task?.scheduledAt?.getFullYear() === currentYear,
        ).length;

        return {
          month: monthName,
          totalAssigned,
          totalCompleted,
          completionRate:
            totalAssigned === 0
              ? 0
              : Math.round((totalCompleted / totalAssigned) * 100),
        };
      },
    );

    const scoreDistribution = {
      '90-100': 0,
      '80-89': 0,
      '70-79': 0,
      'Below 70': 0,
    };

    for (const attempt of attempts) {
      if (attempt.score >= 90) scoreDistribution['90-100']++;
      else if (attempt.score >= 80) scoreDistribution['80-89']++;
      else if (attempt.score >= 70) scoreDistribution['70-79']++;
      else scoreDistribution['Below 70']++;
    }

    const performerMap = new Map<
      string,
      {
        studentId: string;
        name: string;
        email: string;
        totalScore: number;
        completedTasks: number;
      }
    >();

    for (const attempt of attempts) {
      if (!performerMap.has(attempt.studentId)) {
        performerMap.set(attempt.studentId, {
          studentId: attempt.studentId,
          name: `${attempt.student.firstName} ${attempt.student.lastName}`,
          email: attempt.student.email,
          totalScore: 0,
          completedTasks: 0,
        });
      }

      const performer = performerMap.get(attempt.studentId)!;
      performer.totalScore += attempt.score;
      performer.completedTasks++;
    }

    const topPerformers = Array.from(performerMap.values())
      .map((student) => ({
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        completedTasks: student.completedTasks,
        avgScore: Math.round(student.totalScore / student.completedTasks),
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);

    return {
      yearlyTaskPerformance,
      monthlyTaskCompletionRate,
      scoreDistribution,
      topPerformers,
    };
  }

  async getTeacherAnalyticsSummary(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: {
        id: true,
        students: {
          select: { id: true },
        },
        classTasks: {
          where: {
            scheduledTask: {
              isNot: null,
            },
          },
          select: {
            scheduledTask: {
              select: { id: true },
            },
          },
        },
      },
    });

    const studentIds = new Set<string>();
    const scheduledTaskIds = new Set<string>();

    for (const classItem of classes) {
      classItem.students.forEach((student) => studentIds.add(student.id));

      classItem.classTasks.forEach((classTask) => {
        if (classTask.scheduledTask?.id) {
          scheduledTaskIds.add(classTask.scheduledTask.id);
        }
      });
    }

    const completedAttempts = await this.prisma.attempt.findMany({
      where: {
        scheduledTaskId: {
          in: Array.from(scheduledTaskIds),
        },
        status: AttemptStatus.COMPLETED,
      },
      select: {
        score: true,
      },
    });

    const overallAvgScore =
      completedAttempts.length === 0
        ? 0
        : Math.round(
            completedAttempts.reduce((sum, attempt) => sum + attempt.score, 0) /
              completedAttempts.length,
          );

    return {
      totalStudents: studentIds.size,
      totalClasses: classes.length,
      totalTasks: scheduledTaskIds.size,
      completedAttempts: completedAttempts.length,
      overallAvgScore,
    };
  }
}
