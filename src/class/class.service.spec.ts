import { ClassService } from './class.service';

describe('ClassService', () => {
  it('keeps expired work visible and marks unfinished student work overdue', async () => {
    const prisma = {
      class: {
        findUnique: jest.fn().mockResolvedValue({
          teacherId: 'teacher-1',
          students: [{ id: 'student-1' }],
        }),
      },
      classTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'class-task-1',
            addedAt: new Date(),
            task: {
              id: 'task-1',
              title: 'Reading check',
              type: 'READING',
              status: 'APPROVED',
              questions: [{ config: { marks: 2 } }],
              _count: { questions: 1 },
            },
            scheduledTask: {
              id: 'scheduled-1',
              scheduledAt: new Date('2020-01-01'),
              dueAt: new Date('2020-01-02'),
              isActive: true,
              attempts: [],
            },
            class: { id: 'class-1', name: 'Class 1', _count: { students: 1 } },
          },
        ]),
      },
    };
    const service = new ClassService(prisma as any);

    const [activity] = await service.getScheduledTasks('class-1', {
      sub: 'student-1',
      role: 'student',
    });

    expect(activity.status).toBe('OVERDUE');
    expect(activity.totalMarks).toBe(2);
    expect(activity.canAttempt).toBe(false);
  });

  it('uses grouped completion statistics for a teacher instead of loading attempts', async () => {
    const prisma = {
      class: {
        findUnique: jest.fn().mockResolvedValue({
          teacherId: 'teacher-1',
          students: [],
        }),
      },
      classTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'class-task-1',
            addedAt: new Date(),
            task: {
              id: 'task-1',
              title: 'Reading check',
              type: 'READING',
              status: 'APPROVED',
              questions: [{ config: { marks: 2 } }],
              _count: { questions: 1 },
            },
            scheduledTask: {
              id: 'scheduled-1',
              scheduledAt: new Date(),
              dueAt: null,
              isActive: true,
            },
            class: { id: 'class-1', name: 'Class 1', _count: { students: 4 } },
          },
        ]),
      },
      attempt: {
        groupBy: jest.fn().mockResolvedValue([
          {
            scheduledTaskId: 'scheduled-1',
            _count: { _all: 2 },
            _avg: { percentage: 72.5 },
          },
        ]),
      },
    };
    const service = new ClassService(prisma as any);

    const [activity] = await service.getScheduledTasks('class-1', {
      sub: 'teacher-1',
      role: 'teacher',
    });

    expect(prisma.attempt.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['scheduledTaskId'] }),
    );
    expect(activity).toMatchObject({
      completedStudents: 2,
      completionRate: 50,
      averagePercentage: 73,
    });
  });
});
