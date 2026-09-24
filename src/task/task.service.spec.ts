import { TaskService } from './task.service';
import { TaskType } from './dto/task.dto';

describe('TaskService multipart section images', () => {
  it('uploads binary section images and stores only their URLs', async () => {
    const prisma = { task: { create: jest.fn(({ data }) => data) } };
    const upload = {
      uploadSingleImage: jest.fn().mockResolvedValue('https://cdn.test/context.jpg'),
    };
    const service = new TaskService(prisma as any, upload as any, {} as any);

    const result: any = await service.createTask(
      {
        title: 'Reading',
        type: TaskType.READING,
        content: JSON.stringify({ sections: [{ imageUrl: '__SECTION_IMAGE_0__' }] }),
        entryType: ['ENTRY1'] as any,
        questions: [],
      },
      'admin-1',
      'DRAFT',
      'admin',
      [],
      undefined,
      [{ buffer: Buffer.from('image') } as Express.Multer.File],
    );

    expect(JSON.parse(result.readingContent.create.content).sections[0].imageUrl)
      .toBe('https://cdn.test/context.jpg');
    expect(upload.uploadSingleImage).toHaveBeenCalledTimes(1);
  });

  it('updates a full assessment with one question query', async () => {
    const executeRaw = jest.fn();
    const service = new TaskService({} as any, {} as any, {} as any);

    await (service as any).updateQuestionsInBulk(
      { $executeRaw: executeRaw },
      'task-1',
      Array.from({ length: 24 }, (_, order) => ({
        id: `question-${order}`,
        type: 'MCQ',
        order: order + 1,
        config: '{}',
      })),
    );

    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('normalizes Gemini gap-fill output into a usable choice question', () => {
    const service = new TaskService({} as any, {} as any, {} as any);

    const question = (service as any).normalizeImportedQuestion({
      type: 'GAP_FILL',
      content: 'He [gap] (study) English every evening. ______',
      config: { answer: 'studies' },
    });

    expect(question).toMatchObject({
      type: 'GAP_FILL',
      content: 'He __ (study) English every evening.',
      config: { options: ['study', 'studies'], correctIndex: 1 },
    });
  });

  it('uses a text answer instead of rendering empty gap-fill choices', () => {
    const service = new TaskService({} as any, {} as any, {} as any);

    const question = (service as any).normalizeImportedQuestion({
      type: 'GAP_FILL',
      content: 'I __ coffee in the morning.',
      config: { answer: 'drink' },
    });

    expect(question).toMatchObject({
      type: 'QUESTION_ANSWER',
      config: { answer: 'drink' },
    });
  });
});
