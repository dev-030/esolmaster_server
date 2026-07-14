import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  CreateClassDto,
  ScheduleTaskDto,
  StudentQuery,
  UpdateClassDto,
} from './dto/create.dto';
import { PaginationQueryDto } from 'common/dto/pagination.dto';
import { AttemptStatus } from 'src/database/prisma-client/enums';

@Injectable()
export class ClassService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Formatters ───────────────────────────────────────────────

  formatClass = (cls: any) => ({
    id: cls.id,
    name: cls.name,
    subject: cls.subject,
    description: cls.description,
    color: cls.color,
    maxStudents: cls.maxStudents,
    teacherName: cls.teacher
      ? `${cls.teacher.firstName} ${cls.teacher.lastName}`
      : '',
    studentCount: cls._count?.students ?? 0,
    taskCount: cls._count?.classTasks ?? 0,
    classTasks: cls.classTasks?.map(this.formatClassTask) ?? [],
    createdAt: cls.createdAt,
  });

  formatClassTask = (ct: any) => ({
    classTaskId: ct.id,
    addedAt: ct.addedAt,
    task: {
      id: ct.task.id,
      title: ct.task.title,
      type: ct.task.type,
      status: ct.task.status,
      questionCount: ct.task._count?.questions ?? 0,
    },
    scheduled: ct.scheduledTask
      ? {
          id: ct.scheduledTask.id,
          scheduledAt: ct.scheduledTask.scheduledAt,
          dueAt: ct.scheduledTask.dueAt,
          isActive: ct.scheduledTask.isActive,
        }
      : null,
    class: ct.class ? { id: ct.class.id, name: ct.class.name } : null,
  });

  // ─── Class CRUD ───────────────────────────────────────────────

  async create(dto: CreateClassDto, teacherId: string) {
    const subscription = await this.prisma.userSubscription.findUnique({
      where: { userId: teacherId },
      include: { plan: true },
    });

    console.log(subscription)

    if (!subscription || subscription.billingStatus !== 'ACTIVE') {
      throw new BadRequestException('No active subscription found');
    }

    const plan = subscription.plan;

    // Check class limit
    const classCount = await this.prisma.class.count({
      where: { teacherId },
    });

    if (classCount >= plan.maxClasses) {
      throw new BadRequestException(
        `Your plan allows only ${plan.maxClasses} classes.`,
      );
    }

    // Check tasks limit
    if (dto.taskIds && dto.taskIds.length > plan.maxScheduledTasksInClass) {
      throw new BadRequestException(
        `Your plan allows only ${plan.maxScheduledTasksInClass} tasks per class.`,
      );
    }

    const cls = await this.prisma.class.create({
      data: {
        name: dto.name,
        subject: dto.subject,
        description: dto.description,
        color: dto.color,
        maxStudents: subscription.plan.maxStudentsPerClass,
        teacherId,
      },
    });

    if (dto.taskIds?.length) {
      await this.prisma.classTask.createMany({
        data: dto.taskIds.map((taskId) => ({
          classId: cls.id,
          taskId,
        })),
        skipDuplicates: true,
      });
    }

    return cls;
  }

  async findAll(userId: string, role: string, query: PaginationQueryDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const include = {
      teacher: { select: { firstName: true, lastName: true, email: true } },
      _count: { select: { students: true, classTasks: true } },
      classTasks: {
        include: {
          task: { select: { id: true, title: true, type: true, status: true } },
        },
      },
    };

    let where: any = {};

    if (role === 'teacher') where = { teacherId: userId };
    if (role === 'student') where = { students: { some: { id: userId } } };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.class.findMany({ where, skip, take: limit, include }),
      this.prisma.class.count({ where }),
    ]);

    return {
      data: data.map(this.formatClass),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teacher: { select: { firstName: true, lastName: true, email: true } },
        students: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { students: true, classTasks: true } },
        classTasks: {
          include: {
            task: {
              select: { id: true, title: true, type: true, status: true },
            },
            scheduledTask: true,
          },
        },
      },
    });

    if (!cls) throw new NotFoundException('Class not found');

    return {
      ...this.formatClass(cls),
      students: cls.students,
      tasks: cls.classTasks.map(this.formatClassTask),
    };
  }

  async update(id: string, dto: UpdateClassDto) {
    const { taskIds, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id },
        select: { teacherId: true },
      });

      if (!cls) throw new NotFoundException('Class not found');

      const subscription = await tx.userSubscription.findUnique({
        where: { userId: cls.teacherId },
        include: { plan: true },
      });

      if (!subscription || subscription.billingStatus !== 'ACTIVE') {
        throw new BadRequestException('No active subscription');
      }

      const plan = subscription.plan;

      if (taskIds) {
        // Plan limit check
        if (taskIds.length > plan.maxScheduledTasksInClass) {
          throw new BadRequestException(
            `Your plan allows only ${plan.maxScheduledTasksInClass} tasks per class.`,
          );
        }

        const existing = await tx.classTask.findMany({
          where: { classId: id },
          select: { id: true, taskId: true },
        });

        const existingTaskIds = existing.map((t) => t.taskId);

        const toAdd = taskIds.filter((t) => !existingTaskIds.includes(t));

        const toRemove = existing
          .filter((t) => !taskIds.includes(t.taskId))
          .map((t) => t.id);

        await tx.class.update({
          where: { id },
          data: rest,
        });

        if (toAdd.length) {
          await tx.classTask.createMany({
            data: toAdd.map((taskId) => ({
              classId: id,
              taskId,
            })),
          });
        }

        if (toRemove.length) {
          const scheduled = await tx.classScheduledTask.findFirst({
            where: { classTaskId: { in: toRemove } },
          });

          if (scheduled) {
            throw new BadRequestException(
              'Cannot remove a task that has already been scheduled.',
            );
          }

          await tx.classTask.deleteMany({
            where: {
              id: { in: toRemove },
            },
          });
        }
      }

      return tx.class.findUnique({
        where: { id },
        include: {
          classTasks: {
            include: {
              task: { select: { id: true } },
            },
          },
        },
      });
    });
  }

  async remove(id: string) {
    return this.prisma.class.delete({ where: { id } });
  }

  // ─── Student Enrollment ───────────────────────────────────────

  async addStudents(classId: string, studentIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id: classId },
        select: { teacherId: true },
      });

      if (!cls) {
        throw new NotFoundException('Class not found');
      }

      const subscription = await tx.userSubscription.findUnique({
        where: { userId: cls.teacherId },
        include: { plan: true },
      });

      if (!subscription || subscription.billingStatus !== 'ACTIVE') {
        throw new BadRequestException('Teacher subscription inactive');
      }

      const plan = subscription.plan;

      // current students
      const currentStudents = await tx.user.count({
        where: {
          enrolledClasses: {
            some: { id: classId },
          },
        },
      });

      const totalAfterAdd = currentStudents + studentIds.length;

      if (totalAfterAdd > plan.maxStudentsPerClass) {
        throw new BadRequestException(
          `Student limit exceeded. Your plan allows ${plan.maxStudentsPerClass} students per class.`,
        );
      }

      return tx.class.update({
        where: { id: classId },
        data: {
          students: {
            connect: studentIds.map((id) => ({ id })),
          },
        },
      });
    });
  }

  async getStudents(classId: string, query: StudentQuery) {
    const { page = 1, limit = 10, search } = query;

    const skip = (page - 1) * limit;

    const where: any = {
      role: 'student',
      enrolledClasses: {
        some: { id: classId },
      },
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          {
            student: {
              username: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        ],
      }),
    };

    const [students, total, totalScheduledTasks] =
      await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
            createdAt: true,
            isActive: true,
            isOnboarded: true,
            student: {
              select: {
                username: true,
              },
            },
            attempts: {
              where: {
                scheduledTask: {
                  classTask: {
                    classId,
                  },
                },
              },
              select: {
                id: true,
                status: true,
                score: true,
                isPassed: true,
                scheduledTaskId: true,
                startedAt: true,
                completedAt: true,
              },
            },
          },
        }),

        this.prisma.user.count({ where }),

        this.prisma.classScheduledTask.count({
          where: {
            classTask: {
              classId,
            },
            isActive: true,
          },
        }),
      ]);

    return {
      data: students.map((student) => {
        const completedAttempts = student.attempts.filter(
          (attempt) => attempt.status === 'COMPLETED',
        );

        const completedTasks = completedAttempts.length;

        const progressPercentage =
          totalScheduledTasks === 0
            ? 0
            : Math.round((completedTasks / totalScheduledTasks) * 100);

        const passedTasks = completedAttempts.filter(
          (attempt) => attempt.isPassed,
        ).length;

        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          fullName: `${student.firstName} ${student.lastName}`,
          email: student.email,
          avatarUrl: student.avatarUrl,
          username: student.student?.username ?? null,
          isActive: student.isActive,
          isOnboarded: student.isOnboarded,
          joinedAt: student.createdAt,

          progress: {
            totalTasks: totalScheduledTasks,
            startedTasks: student.attempts.length,
            completedTasks,
            passedTasks,
            progressPercentage,
          },
        };
      }),

      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  async removeStudents(classId: string, studentIds: string[]) {
    return this.prisma.class.update({
      where: { id: classId },
      data: {
        students: { disconnect: studentIds.map((id) => ({ id })) },
      },
    });
  }

  // ─── Class Tasks ──────────────────────────────────────────────

  async addTasks(classId: string, taskIds: string[]) {
    // Verify class exists
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found');

    // Premium tasks are teacher-gated: the class's teacher must be on a package
    // that includes the task.
    await this.assertTeacherCanUsePremiumTasks(cls.teacherId, taskIds);

    await this.prisma.classTask.createMany({
      data: taskIds.map((taskId) => ({ classId, taskId })),
      skipDuplicates: true,
    });

    return this.getClassTasks(classId);
  }

  /**
   * Teacher-gated premium access: a premium task may only be added to a class
   * if the class's teacher has an active package that includes that task.
   */
  private async assertTeacherCanUsePremiumTasks(
    teacherId: string,
    taskIds: string[],
  ) {
    if (!taskIds?.length) return;

    const premiumTasks = await this.prisma.task.findMany({
      where: { id: { in: taskIds }, isPremium: true },
      select: { id: true, title: true },
    });
    if (!premiumTasks.length) return;

    const sub = await this.prisma.userSubscription.findUnique({
      where: { userId: teacherId },
      select: { planId: true, billingStatus: true },
    });

    const activeStatuses = ['ACTIVE', 'TRIALING', 'CANCELING'];
    if (!sub || !activeStatuses.includes(sub.billingStatus)) {
      throw new ForbiddenException(
        'An active package is required to use premium tasks.',
      );
    }

    const allowed = await this.prisma.planPremiumTask.findMany({
      where: {
        planId: sub.planId,
        taskId: { in: premiumTasks.map((t) => t.id) },
      },
      select: { taskId: true },
    });
    const allowedSet = new Set(allowed.map((a) => a.taskId));

    const blocked = premiumTasks.filter((t) => !allowedSet.has(t.id));
    if (blocked.length) {
      throw new ForbiddenException(
        `Your package does not include these premium tasks: ${blocked
          .map((t) => t.title)
          .join(', ')}`,
      );
    }
  }

  async getClassTasks(classId: string) {
    const classTasks = await this.prisma.classTask.findMany({
      where: { classId },
      include: {
        task: { select: { id: true, title: true, type: true, status: true } },
        scheduledTask: true,
      },
      orderBy: { addedAt: 'desc' },
    });

    return classTasks.map(this.formatClassTask);
  }

  async removeTasks(classId: string, taskIds: string[]) {
    await this.prisma.classTask.deleteMany({
      where: {
        classId,
        taskId: { in: taskIds },
      },
    });

    return { message: 'Tasks removed from class' };
  }

  // ─── Scheduling ───────────────────────────────────────────────

  async scheduleTask(classId: string, dto: ScheduleTaskDto) {
    // Verify ClassTask belongs to this class
    const classTask = await this.prisma.classTask.findFirst({
      where: { id: dto.classTaskId, classId },
      include: { task: true },
    });

    if (!classTask) {
      throw new NotFoundException('Task not found in this class');
    }

    if (classTask.task.status !== 'APPROVED') {
      throw new BadRequestException(
        'Only APPROVED tasks can be scheduled for students.',
      );
    }

    // Upsert scheduled task
    return this.prisma.classScheduledTask.upsert({
      where: { classTaskId: dto.classTaskId },
      update: {
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        isActive: dto.isActive ?? true,
      },
      create: {
        classTaskId: dto.classTaskId, // only this needed
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getScheduledTasks(classId: string, req: any) {
    const role = req.role;
    const studentId = req.sub;

    const classTasks = await this.prisma.classTask.findMany({
      where: {
        classId,
        ...(role === 'student' ? { scheduledTask: { isActive: true } } : {}),
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            _count: { select: { questions: true } },
          },
        },

        scheduledTask: {
          include: {
            attempts: {
              where:
                role === 'student' ? { studentId } : { status: 'COMPLETED' },
              select: {
                id: true,
                status: true,
                _count: {
                  select: { answers: true },
                },
              },
            },
          },
        },

        class: {
          select: {
            id: true,
            name: true,
            _count: { select: { students: true } },
          },
        },
      },
    });

    return classTasks
      .filter((ct) => ct.scheduledTask !== null)
      .map((ct) => {
        const base = this.formatClassTask(ct);

        const totalQuestions = ct.task._count.questions;

        // ----------------------
        // TEACHER VIEW
        // ----------------------
        if (role !== 'student') {
          const totalStudents = ct.class._count.students;
          const completedStudents = ct.scheduledTask!.attempts.length;

          const completionRate =
            totalStudents === 0
              ? 0
              : Math.round((completedStudents / totalStudents) * 100);

          return {
            ...base,
            totalStudents,
            completedStudents,
            completionRate,
          };
        }

        // ----------------------
        // STUDENT VIEW
        // ----------------------
        const attempt = ct.scheduledTask!.attempts[0];

        let answeredQuestions = 0;
        let status = 'NOT_STARTED';

        if (attempt) {
          answeredQuestions = attempt._count.answers;

          if (attempt.status === 'COMPLETED') {
            status = 'COMPLETED';
          } else {
            status = 'IN_PROGRESS';
          }
        }

        const progressPercentage =
          totalQuestions === 0
            ? 0
            : Math.round((answeredQuestions / totalQuestions) * 100);

        return {
          ...base,
          totalQuestions,
          answeredQuestions,
          progressPercentage,
          status,
        };
      });
  }
  async unscheduleTask(classId: string, classTaskId: string) {
    // Verify it belongs to this class
    const classTask = await this.prisma.classTask.findFirst({
      where: { id: classTaskId, classId },
    });

    if (!classTask) throw new NotFoundException('Task not found in this class');

    await this.prisma.classScheduledTask.delete({
      where: { classTaskId },
    });

    return { message: 'Task unscheduled successfully' };
  }

  async getScheduledTaskAnalytics(classId: string, scheduledTaskId: string) {
    const scheduledTask = await this.prisma.classScheduledTask.findUnique({
      where: { id: scheduledTaskId },
      select: {
        classTask: {
          select: {
            classId: true,
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
    });

    if (!scheduledTask || scheduledTask.classTask.classId !== classId) {
      throw new NotFoundException('Scheduled task not found for this class');
    }

    const classData = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        _count: { select: { students: true } },
      },
    });

    const totalStudents = classData?._count.students ?? 0;

    const completedStudents = await this.prisma.attempt.count({
      where: {
        scheduledTaskId,
        status: 'COMPLETED',
      },
    });

    const completionRate =
      totalStudents === 0
        ? 0
        : Math.round((completedStudents / totalStudents) * 100);

    const totalAnswers = await this.prisma.studentAnswer.groupBy({
      by: ['questionId'],
      where: {
        attempt: {
          scheduledTaskId,
          status: 'COMPLETED',
        },
      },
      _count: {
        questionId: true,
      },
    });

    const correctAnswers = await this.prisma.studentAnswer.groupBy({
      by: ['questionId'],
      where: {
        isCorrect: true,
        attempt: {
          scheduledTaskId,
          status: 'COMPLETED',
        },
      },
      _count: {
        questionId: true,
      },
    });

    const correctMap = new Map(
      correctAnswers.map((q) => [q.questionId, q._count.questionId]),
    );

    const analyticsMap = new Map(
      totalAnswers.map((q) => {
        const correct = correctMap.get(q.questionId) ?? 0;
        const total = q._count.questionId;

        return [
          q.questionId,
          {
            totalAnswers: total,
            correctAnswers: correct,
            correctPercentage:
              total === 0 ? 0 : Math.round((correct / total) * 100),
          },
        ];
      }),
    );

    const taskQuestions = await this.prisma.question.findMany({
      where: {
        taskId: scheduledTask.classTask.task.id,
      },
      select: {
        id: true,
        type: true,
        config: true,
        order: true,
      },
      orderBy: {
        order: 'asc',
      },
    });

    const questions = taskQuestions.map((question) => {
      const analytics = analyticsMap.get(question.id) ?? {
        totalAnswers: 0,
        correctAnswers: 0,
        correctPercentage: 0,
      };

      return {
        questionId: question.id,
        type: question.type,
        config: question.config,
        order: question.order,
        ...analytics,
      };
    });

    return {
      task: scheduledTask.classTask.task,
      totalStudents,
      completedStudents,
      completionRate,
      questions,
    };
  }

  async getClassStudentProgress(teacherId: string, classId: string) {
    const classData = await this.prisma.class.findFirst({
      where: {
        id: classId,
        teacherId,
      },
      include: {
        students: {
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
          include: {
            scheduledTask: {
              select: {
                id: true,
                isActive: true,
                scheduledAt: true,
                dueAt: true,
              },
            },
          },
        },
      },
    });

    if (!classData) {
      throw new NotFoundException(
        'Class not found or you do not own this class',
      );
    }

    const scheduledTaskIds = classData.classTasks
      .map((classTask) => classTask.scheduledTask?.id)
      .filter(Boolean) as string[];

    const totalScheduledTasks = scheduledTaskIds.length;

    const attempts = await this.prisma.attempt.findMany({
      where: {
        scheduledTaskId: {
          in: scheduledTaskIds,
        },
        studentId: {
          in: classData.students.map((student) => student.id),
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

    const students = classData.students.map((student) => {
      const studentAttempts = attempts.filter(
        (attempt) => attempt.studentId === student.id,
      );

      const completedAttempts = studentAttempts.filter(
        (attempt) => attempt.status === AttemptStatus.COMPLETED,
      );

      const inProgressAttempts = studentAttempts.filter(
        (attempt) => attempt.status === AttemptStatus.IN_PROGRESS,
      );

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

      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,

        totalScheduledTasks,
        completedTasks,
        inProgressTasks,
        notStartedTasks: Math.max(notStartedTasks, 0),

        progressPercentage,
        avgScore,
        status,
      };
    });

    return {
      classId: classData.id,
      className: classData.name,
      totalStudents: classData.students.length,
      totalScheduledTasks,
      students,
    };
  }
}
