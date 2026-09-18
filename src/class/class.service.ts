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
import { randomInt } from 'crypto';
import { ClassJoinStatus } from './dto/create.dto';

@Injectable()
export class ClassService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateJoinCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      if (!(await this.prisma.class.findUnique({ where: { joinCode: code }, select: { id: true } }))) {
        return code;
      }
    }
  }

  private async assertClassAccess(classId: string, user: { sub: string; role: string }) {
    if (user.role === 'admin') return;

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { teacherId: true, students: { where: { id: user.sub }, select: { id: true } } },
    });

    if (
      !cls ||
      !['teacher', 'student'].includes(user.role) ||
      (user.role === 'teacher' && cls.teacherId !== user.sub) ||
      (user.role === 'student' && !cls.students.length)
    ) {
      throw new ForbiddenException('You do not have access to this class');
    }
  }

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
    joinStatus: cls.joinStatus,
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

  private async getOrCreateTeacherSubscription(teacherId: string, tx?: any) {
    const client = tx || this.prisma;
    let subscription = await client.userSubscription.findUnique({
      where: { userId: teacherId },
      include: { plan: true },
    });

    if (!subscription) {
      const freePlan = await client.subscriptionPlan.findFirst({
        where: { type: 'FREE', isActive: true },
      });
      if (freePlan) {
        subscription = await client.userSubscription.create({
          data: {
            userId: teacherId,
            planId: freePlan.id,
            billingStatus: 'ACTIVE',
            boughtPrice: 0,
            discountAmount: 0,
            finalPrice: 0,
          },
          include: { plan: true },
        });
      }
    }

    return subscription;
  }

  private hasTeacherAccess(subscription: { billingStatus: string } | null | undefined) {
    return Boolean(
      subscription && ['ACTIVE', 'TRIALING', 'CANCELING'].includes(subscription.billingStatus),
    );
  }

  // ─── Class CRUD ───────────────────────────────────────────────

  async create(dto: CreateClassDto, teacherId: string) {
    const subscription = await this.getOrCreateTeacherSubscription(teacherId);

    if (!this.hasTeacherAccess(subscription)) {
      throw new BadRequestException('No active subscription found');
    }

    const plan = subscription.plan;

    // Check class limit
    const classCount = await this.prisma.class.count({
      where: { teacherId },
    });

    if (classCount >= plan.maxClasses) {
      throw new BadRequestException(
        `Your plan allows only ${plan.maxClasses} classes. Please upgrade your subscription to create more classes.`,
      );
    }

    // Check tasks limit
    if (dto.taskIds && dto.taskIds.length > plan.maxScheduledTasksInClass) {
      throw new BadRequestException(
        `Your plan allows only ${plan.maxScheduledTasksInClass} assigned activities per class.`,
      );
    }

    let maxStudents: number | null = null;
    if (dto.maxStudents !== undefined && dto.maxStudents !== null && dto.maxStudents > 0) {
      if (dto.maxStudents > plan.maxStudentsPerClass) {
        throw new BadRequestException(
          `Your plan allows a maximum of ${plan.maxStudentsPerClass} students per class.`,
        );
      }
      maxStudents = dto.maxStudents;
    } else {
      maxStudents = plan.maxStudentsPerClass;
    }

    const cls = await this.prisma.class.create({
      data: {
        name: dto.name,
        subject: dto.subject,
        description: dto.description,
        color: dto.color,
        maxStudents,
        teacherId,
        joinCode: await this.generateJoinCode(),
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

  async joinByCode(rawCode: string, studentId: string) {
    const code = rawCode.trim().toUpperCase();
    const cls = await this.prisma.class.findUnique({
      where: { joinCode: code },
      include: {
        students: { where: { id: studentId }, select: { id: true } },
        _count: { select: { students: true } },
        teacher: {
          include: {
            userSubscription: {
              include: { plan: true },
            },
          },
        },
      },
    });

    if (!cls) throw new NotFoundException('Class invite code not found');
    if (cls.joinStatus !== 'OPEN') {
      throw new BadRequestException(
        cls.joinStatus === 'PAUSED'
          ? 'This class is temporarily not accepting new students.'
          : 'This class is no longer accepting new students.',
      );
    }
    if (cls.students.length) return { message: 'You are already enrolled in this class', class: this.formatClass(cls) };

    const planLimit = cls.teacher?.userSubscription?.plan?.maxStudentsPerClass ?? 20;
    const effectiveLimit = Math.min(
      cls.maxStudents !== null && cls.maxStudents !== undefined ? cls.maxStudents : planLimit,
      planLimit,
    );
    if (cls._count.students >= effectiveLimit) {
      throw new BadRequestException('This class has reached its maximum student capacity.');
    }

    const joinedClass = await this.prisma.class.update({
      where: { id: cls.id },
      data: { students: { connect: { id: studentId } } },
      include: {
        teacher: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { students: true, classTasks: true } },
      },
    });

    return { message: 'Joined class successfully', class: this.formatClass(joinedClass) };
  }

  async regenerateJoinCode(id: string, user: { sub: string; role: string }) {
    await this.assertClassAccess(id, user);
    const joinCode = await this.generateJoinCode();
    return this.prisma.class.update({ where: { id }, data: { joinCode }, select: { id: true, joinCode: true, joinStatus: true } });
  }

  async updateJoinStatus(id: string, status: ClassJoinStatus, user: { sub: string; role: string }) {
    await this.assertClassAccess(id, user);
    return this.prisma.class.update({ where: { id }, data: { joinStatus: status }, select: { id: true, joinCode: true, joinStatus: true } });
  }

  async findAll(userId: string, role: string, query: PaginationQueryDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const include = {
      teacher: { select: { firstName: true, lastName: true, email: true } },
      _count: { select: { students: true, classTasks: true } },
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

  async findOne(id: string, user: { sub: string; role: string }) {
    await this.assertClassAccess(id, user);
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
      joinCode: user.role === 'teacher' ? cls.joinCode : undefined,
      students: cls.students,
      tasks: cls.classTasks.map(this.formatClassTask),
    };
  }

  async update(id: string, dto: UpdateClassDto, user: { sub: string; role: string }) {
    await this.assertClassAccess(id, user);
    const { taskIds, maxStudents, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id },
        select: { teacherId: true },
      });

      if (!cls) throw new NotFoundException('Class not found');

      const subscription = await this.getOrCreateTeacherSubscription(cls.teacherId, tx);

      if (!this.hasTeacherAccess(subscription)) {
        throw new BadRequestException('No active subscription');
      }

      const plan = subscription.plan;

      const updateData: any = { ...rest };
      if (maxStudents !== undefined) {
        if (maxStudents !== null && maxStudents > plan.maxStudentsPerClass) {
          throw new BadRequestException(
            `Your plan allows a maximum of ${plan.maxStudentsPerClass} students per class.`,
          );
        }
        updateData.maxStudents =
          maxStudents === null || maxStudents === 0 ? plan.maxStudentsPerClass : maxStudents;
      }

      await tx.class.update({
        where: { id },
        data: updateData,
      });

      if (taskIds) {
        // Plan limit check
        if (taskIds.length > plan.maxScheduledTasksInClass) {
          throw new BadRequestException(
            `Your plan allows only ${plan.maxScheduledTasksInClass} assigned activities per class.`,
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

  async remove(id: string, user: { sub: string; role: string }) {
    await this.assertClassAccess(id, user);
    return this.prisma.class.delete({ where: { id } });
  }

  // ─── Student Enrollment ───────────────────────────────────────

  async addStudents(classId: string, studentIds: string[], user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
    const uniqueStudentIds = [...new Set(studentIds)];
    return this.prisma.$transaction(async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id: classId },
        select: { teacherId: true, maxStudents: true, students: { select: { id: true } } },
      });

      if (!cls) {
        throw new NotFoundException('Class not found');
      }

      const subscription = await this.getOrCreateTeacherSubscription(cls.teacherId, tx);

      if (!this.hasTeacherAccess(subscription)) {
        throw new BadRequestException('Teacher subscription inactive');
      }

      const plan = subscription.plan;

      const validStudents = await tx.user.findMany({
        where: { id: { in: uniqueStudentIds }, role: 'student' },
        select: { id: true },
      });

      if (validStudents.length !== uniqueStudentIds.length) {
        throw new BadRequestException('Only active student accounts can be added to a class.');
      }

      const enrolledIds = new Set(cls.students.map((student) => student.id));
      const studentsToAdd = validStudents.filter((student) => !enrolledIds.has(student.id));
      const totalAfterAdd = cls.students.length + studentsToAdd.length;
      const effectiveLimit = Math.min(
        cls.maxStudents !== null && cls.maxStudents !== undefined ? cls.maxStudents : plan.maxStudentsPerClass,
        plan.maxStudentsPerClass,
      );

      if (totalAfterAdd > effectiveLimit) {
        throw new BadRequestException(
          `Student limit exceeded. This class allows a maximum of ${effectiveLimit} students under your current plan (${plan.name}).`,
        );
      }

      return tx.class.update({
        where: { id: classId },
        data: {
          students: {
            connect: studentsToAdd.map(({ id }) => ({ id })),
          },
        },
      });
    });
  }

  async getStudents(classId: string, query: StudentQuery, user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
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
  async removeStudents(classId: string, studentIds: string[], user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
    return this.prisma.class.update({
      where: { id: classId },
      data: {
        students: { disconnect: studentIds.map((id) => ({ id })) },
      },
    });
  }

  async leave(classId: string, user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
    return this.prisma.class.update({
      where: { id: classId },
      data: { students: { disconnect: { id: user.sub } } },
    });
  }

  // ─── Class Tasks ──────────────────────────────────────────────

  async addTasks(classId: string, taskIds: string[], user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
    // Verify class exists
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: {
          include: {
            userSubscription: { include: { plan: true } },
          },
        },
        classTasks: { select: { taskId: true } },
      },
    });
    if (!cls) throw new NotFoundException('Class not found');

    if (!this.hasTeacherAccess(cls.teacher?.userSubscription)) {
      throw new ForbiddenException('Your subscription is not active. Update billing to manage activities.');
    }

    const requestedTaskIds = [...new Set(taskIds)];
    const existingTaskIds = new Set(cls.classTasks.map((classTask) => classTask.taskId));
    const taskIdsToAdd = requestedTaskIds.filter((taskId) => !existingTaskIds.has(taskId));
    const planTasksLimit = cls.teacher?.userSubscription?.plan?.maxScheduledTasksInClass ?? 5;
    if (cls.classTasks.length + taskIdsToAdd.length > planTasksLimit) {
      throw new BadRequestException(
        `Your plan allows only ${planTasksLimit} activities per class. Upgrade your plan to add more.`,
      );
    }

    // Premium tasks are teacher-gated: the class's teacher must be on a package
    // that includes the task.
    await this.assertTeacherCanUsePremiumTasks(cls.teacherId, taskIdsToAdd);

    await this.prisma.classTask.createMany({
      data: taskIdsToAdd.map((taskId) => ({ classId, taskId })),
      skipDuplicates: true,
    });

    return this.getClassTasks(classId, user);
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

    const sub = await this.getOrCreateTeacherSubscription(teacherId);

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

  async getClassTasks(classId: string, user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
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

  async removeTasks(classId: string, taskIds: string[], user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
    await this.prisma.classTask.deleteMany({
      where: {
        classId,
        taskId: { in: taskIds },
      },
    });

    return { message: 'Tasks removed from class' };
  }

  // ─── Scheduling ───────────────────────────────────────────────

  async scheduleTask(classId: string, dto: ScheduleTaskDto, user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && dueAt <= new Date()) {
      throw new BadRequestException('Due date must be in the future.');
    }
    // Verify ClassTask belongs to this class
    const classTask = await this.prisma.classTask.findFirst({
      where: { id: dto.classTaskId, classId },
      include: {
        task: {
          select: {
            status: true,
            questions: {
              where: { type: { not: 'INSTRUCTION' } },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!classTask) {
      throw new NotFoundException('Task not found in this class');
    }

    if (classTask.task.status !== 'APPROVED') {
      throw new BadRequestException(
        'Only APPROVED tasks can be scheduled for students.',
      );
    }

    if (!classTask.task.questions.length) {
      throw new BadRequestException('Only activities with at least one question can be assigned.');
    }

    // Verify scheduled task limit if scheduling as active
    if (dto.isActive !== false) {
      const cls = await this.prisma.class.findUnique({
        where: { id: classId },
        include: {
          teacher: {
            include: { userSubscription: { include: { plan: true } } },
          },
        },
      });
      if (!this.hasTeacherAccess(cls?.teacher?.userSubscription)) {
        throw new ForbiddenException('Your subscription is not active. Update billing to assign activities.');
      }
      const planTasksLimit = cls?.teacher?.userSubscription?.plan?.maxScheduledTasksInClass ?? 5;
      const currentActiveCount = await this.prisma.classScheduledTask.count({
        where: {
          classTask: { classId },
          isActive: true,
          classTaskId: { not: dto.classTaskId },
        },
      });
      if (currentActiveCount >= planTasksLimit) {
        throw new BadRequestException(
          `Your plan allows a maximum of ${planTasksLimit} active assigned activities per class.`,
        );
      }
    }

    // Upsert scheduled task
    return this.prisma.classScheduledTask.upsert({
      where: { classTaskId: dto.classTaskId },
      update: {
        dueAt,
        isActive: dto.isActive ?? true,
      },
      create: {
        classTaskId: dto.classTaskId, // only this needed
        dueAt,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getScheduledTasks(classId: string, req: any) {
    await this.assertClassAccess(classId, req);
    const role = req.role;
    const studentId = req.sub;

    const classTasks = await this.prisma.classTask.findMany({
      where: {
        classId,
        ...(role === 'student'
          ? {
              scheduledTask: {
                isActive: true,
              },
            }
          : {}),
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            questions: {
              where: { type: { not: 'INSTRUCTION' } },
              select: { config: true },
            },
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
                score: true,
                percentage: true,
                isPassed: true,
                completedAt: true,
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

        const totalQuestions = ct.task.questions.length;
        const totalMarks = ct.task.questions.reduce((sum, question) => {
          const marks = (question.config as any)?.marks;
          return sum + (typeof marks === 'number' ? marks : 1);
        }, 0);

        // ----------------------
        // TEACHER VIEW
        // ----------------------
        if (role !== 'student') {
          const totalStudents = ct.class._count.students;
          const completedStudents = ct.scheduledTask!.attempts.length;
          const averagePercentage = completedStudents
            ? Math.round(
                ct.scheduledTask!.attempts.reduce(
                  (sum, attempt) => sum + (attempt.percentage ?? 0),
                  0,
                ) / completedStudents,
              )
            : 0;

          const completionRate =
            totalStudents === 0
              ? 0
              : Math.round((completedStudents / totalStudents) * 100);

          return {
            ...base,
            totalStudents,
            completedStudents,
            completionRate,
            averagePercentage,
            totalMarks,
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

        const isOverdue = Boolean(
          ct.scheduledTask!.dueAt && ct.scheduledTask!.dueAt < new Date(),
        );
        if (isOverdue && status !== 'COMPLETED') status = 'OVERDUE';

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
          score: attempt?.score ?? null,
          percentage: attempt?.percentage ?? null,
          isPassed: attempt?.isPassed ?? null,
          completedAt: attempt?.completedAt ?? null,
          totalMarks,
          canAttempt: !isOverdue && status !== 'COMPLETED',
        };
      });
  }
  async unscheduleTask(classId: string, classTaskId: string, user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
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

  async getScheduledTaskAnalytics(classId: string, scheduledTaskId: string, user: { sub: string; role: string }) {
    await this.assertClassAccess(classId, user);
    const scheduledTask = await this.prisma.classScheduledTask.findUnique({
      where: { id: scheduledTaskId },
      select: {
        scheduledAt: true,
        dueAt: true,
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
      throw new NotFoundException('Assigned activity not found for this class');
    }

    const classData = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        students: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const totalStudents = classData?.students.length ?? 0;

    const attempts = await this.prisma.attempt.findMany({
      where: {
        scheduledTaskId,
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        score: true,
        percentage: true,
        isPassed: true,
        startedAt: true,
        completedAt: true,
      },
    });
    const completedAttempts = attempts.filter((attempt) => attempt.status === 'COMPLETED');
    const completedStudents = completedAttempts.length;

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
        type: { not: 'INSTRUCTION' },
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

    const totalMarks = taskQuestions.reduce((sum, question) => {
      const marks = (question.config as any)?.marks;
      return sum + (typeof marks === 'number' ? marks : 1);
    }, 0);
    const attemptsByStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt]));
    const students = (classData?.students ?? []).map((student) => {
      const attempt = attemptsByStudent.get(student.id);
      const isOverdue = Boolean(
        scheduledTask.dueAt && scheduledTask.dueAt < new Date(),
      );
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        email: student.email,
        attemptId: attempt?.id ?? null,
        status:
          attempt?.status === 'COMPLETED'
            ? 'COMPLETED'
            : isOverdue
              ? 'OVERDUE'
              : (attempt?.status ?? 'NOT_STARTED'),
        score: attempt?.status === 'COMPLETED' ? attempt.score : null,
        percentage: attempt?.status === 'COMPLETED' ? attempt.percentage : null,
        isPassed: attempt?.status === 'COMPLETED' ? attempt.isPassed : null,
        startedAt: attempt?.startedAt ?? null,
        completedAt: attempt?.completedAt ?? null,
      };
    });
    const averagePercentage = completedStudents
      ? Math.round(
          completedAttempts.reduce(
            (sum, attempt) => sum + (attempt.percentage ?? 0),
            0,
          ) / completedStudents,
        )
      : 0;

    return {
      task: scheduledTask.classTask.task,
      scheduledAt: scheduledTask.scheduledAt,
      dueAt: scheduledTask.dueAt,
      totalStudents,
      completedStudents,
      completionRate,
      averagePercentage,
      totalMarks,
      students,
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
