import { AttemptService } from './attempt.service';

describe('AttemptService', () => {
  it('does not count instruction blocks as marks', () => {
    const service = new AttemptService({} as any, {} as any);
    const result = (service as any).calculateFinalResult({
      score: 1,
      answers: [],
      task: {
        readingContent: null,
        questions: [
          { type: 'INSTRUCTION', config: { marks: 99 } },
          { type: 'MCQ', config: { marks: 1 } },
        ],
      },
    });

    expect(result.isPassed).toBe(true);
  });

  it('lets a student reopen a completed result after the due date', async () => {
    const completed = { id: 'attempt-1', status: 'COMPLETED' };
    const prisma = {
      classScheduledTask: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          dueAt: new Date('2020-01-01'),
          attempts: [completed],
          classTask: { class: { students: [{ id: 'student-1' }] } },
        }),
      },
      attempt: { upsert: jest.fn() },
    };
    const service = new AttemptService(prisma as any, {} as any);

    await expect(
      service.startOrResumeAttempt('student-1', 'scheduled-1'),
    ).resolves.toEqual(completed);
    expect(prisma.attempt.upsert).not.toHaveBeenCalled();
  });
});
