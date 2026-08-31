import axios from 'axios';
import { parseOffice } from 'officeparser';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  AddQuestionsDto,
  CreateTaskDto,
  TaskQueryDto,
  TaskType,
} from './dto/task.dto';
import { UploadService } from 'src/upload/upload.service';
import { QuestionType } from 'src/database/prisma-client/enums';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PaginationQueryDto } from 'common/dto/pagination.dto';

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async createTask(
    dto: CreateTaskDto,
    userId: string,
    status: any,
    role: string,
    files?: Express.Multer.File[],
    passageImage?: Express.Multer.File,
  ) {
    const {
      title,
      type,
      content,
      entryType,
      words,
      questions,
      awardingBody,
      passMark,
      timeLimit,
      feedbackMode,
    } = dto;

    let vocabularyItemsData:
      | { wordName: string; definition: string; imageUrl?: string }[]
      | undefined;

    console.log('Images', files);

    /**
     * Handle Vocabulary Words
     */
    if (type === TaskType.VOCABULARY && words?.length) {
      vocabularyItemsData = [];

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        let imageUrl = word.imageUrl;

        // Upload image if provided
        if (files?.[i]) {
          imageUrl = await this.uploadService.uploadSingleImage(
            files[i],
            'vocabulary_images',
          );
        }

        vocabularyItemsData.push({
          wordName: word.wordName,
          definition: word.definition,
          imageUrl,
        });
      }
    }
    let passageImageUrl: string | undefined;
    if (type === TaskType.READING && passageImage) {
      passageImageUrl =
        await this.uploadService.uploadSingleImage(passageImage);
    }

    /**
     * Create Task
     */
    return this.prisma.task.create({
      data: {
        title,
        type,
        status,
        folderId: dto.folderId,
        isPublic: role === 'admin',
        // Only admins may mark a task premium.
        isPremium: role === 'admin' ? (dto.isPremium ?? false) : false,
        timeLimit: timeLimit ?? null,
        feedbackMode: feedbackMode ?? 'IMMEDIATE',
        createdById: userId,

        /**
         * Reading Content
         */
        readingContent:
          type === TaskType.READING && content && entryType?.length
            ? {
                create: {
                  content,
                  entryType,
                  awardingBody,
                  passMark,
                  passLogic: dto.passLogic,
                  imageUrl: passageImageUrl,
                },
              }
            : undefined,

        /**
         * Grammar Content
         */
        grammarContent:
          type === TaskType.GRAMMAR && content && entryType?.length
            ? {
                create: {
                  content,
                  entryType,
                },
              }
            : undefined,

        /**
         * Vocabulary Words
         */
        vocabularyItems:
          type === TaskType.VOCABULARY && vocabularyItemsData?.length
            ? {
                createMany: {
                  data: vocabularyItemsData,
                },
              }
            : undefined,

        /**
         * Questions
         */
        questions: questions?.length
          ? {
              createMany: {
                data: questions.map((q) => ({
                  type: q.type as QuestionType,
                  order: q.order,
                  config: q.config as any,
                  criterionId: q.criterionId,
                })),
              },
            }
          : undefined,
      },

      include: {
        readingContent: true,
        grammarContent: true,
        vocabularyItems: true,
        questions: true,
      },
    });
  }

  async updateTask(
    taskId: string,
    dto: UpdateTaskDto,
    userId: string,
    role: string,
    files: Express.Multer.File[] = [],
  ) {
    const existingTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        readingContent: true,
        grammarContent: true,
        vocabularyItems: true,
        questions: true,
      },
    });

    if (!existingTask) {
      throw new NotFoundException('Task not found');
    }

    // optional ownership/permission logic
    if (role !== 'admin' && existingTask.createdById !== userId) {
      throw new ForbiddenException('You are not allowed to update this task');
    }

    const fileMap = new Map<string, Express.Multer.File>();
    for (const file of files) {
      fileMap.set(file.fieldname, file);
    }

    let newPassageImageUrl: string | undefined;
    const passageImage = fileMap.get('passageImage');
    if (passageImage) {
      newPassageImageUrl =
        await this.uploadService.uploadSingleImage(passageImage);
    }

    return this.prisma.$transaction(async (tx) => {
      /**
       * delete questions
       */
      if (dto.deleteQuestionIds?.length) {
        await tx.question.deleteMany({
          where: {
            id: { in: dto.deleteQuestionIds },
            taskId,
          },
        });
      }

      /**
       * update questions
       */
      if (dto.updateQuestions?.length) {
        for (const q of dto.updateQuestions) {
          const updateData: any = {};

          if (q.type !== undefined) updateData.type = q.type;
          if (q.order !== undefined) updateData.order = q.order;
          if (q.config !== undefined) updateData.config = q.config;
          if (q.criterionId !== undefined)
            updateData.criterionId = q.criterionId;

          await tx.question.update({
            where: { id: q.id },
            data: updateData,
          });
        }
      }

      /**
       * append questions
       *
       * Created one-by-one (instead of createMany) so we can echo each new
       * row's real id back to the client keyed by its clientKey. This lets the
       * frontend autosave without re-inserting the same question on the next save.
       */
      const createdQuestions: { clientKey: string; id: string }[] = [];
      if (dto.newQuestions?.length) {
        for (const q of dto.newQuestions) {
          const created = await tx.question.create({
            data: {
              taskId,
              type: q.type as QuestionType,
              order: q.order,
              config: q.config,
              criterionId: q.criterionId,
            },
          });
          if (q.clientKey) {
            createdQuestions.push({ clientKey: q.clientKey, id: created.id });
          }
        }
      }

      /**
       * delete words
       */
      if (dto.deleteWordIds?.length) {
        await tx.wordItem.deleteMany({
          where: {
            id: { in: dto.deleteWordIds },
            taskId,
          },
        });
      }

      /**
       * update words
       */
      if (dto.updateWords?.length) {
        for (const word of dto.updateWords) {
          const updateData: any = {};

          if (word.wordName !== undefined) updateData.wordName = word.wordName;
          if (word.definition !== undefined)
            updateData.definition = word.definition;

          if (word.removeImage) {
            updateData.imageUrl = null;
          }

          if (word.imageKey) {
            const imageFile = fileMap.get(`wordImage_${word.imageKey}`);
            if (imageFile) {
              updateData.imageUrl = await this.uploadService.uploadSingleImage(
                imageFile,
                'vocabulary_images',
              );
            }
          }

          await tx.wordItem.update({
            where: { id: word.id },
            data: updateData,
          });
        }
      }

      /**
       * append words
       */
      if (dto.newWords?.length) {
        for (const word of dto.newWords) {
          let imageUrl = word.imageUrl;

          if (word.imageKey) {
            const imageFile = fileMap.get(`wordImage_${word.imageKey}`);
            if (imageFile) {
              imageUrl = await this.uploadService.uploadSingleImage(
                imageFile,
                'vocabulary_images',
              );
            }
          }

          await tx.wordItem.create({
            data: {
              taskId,
              wordName: word.wordName,
              definition: word.definition,
              imageUrl,
            },
          });
        }
      }

      /**
       * update reading/grammar content
       */
      if (existingTask.type === 'READING') {
        const shouldUpdateReading =
          dto.content !== undefined ||
          dto.entryType !== undefined ||
          dto.removePassageImage ||
          newPassageImageUrl !== undefined ||
          dto.awardingBody !== undefined ||
          dto.passLogic !== undefined ||
          dto.passMark !== undefined;

        if (shouldUpdateReading) {
          if (existingTask.readingContent) {
            await tx.readingTask.update({
              where: { taskId },
              data: {
                content: dto.content ?? existingTask.readingContent.content,
                entryType:
                  dto.entryType ?? existingTask.readingContent.entryType,
                imageUrl:
                  newPassageImageUrl !== undefined
                    ? newPassageImageUrl
                    : dto.removePassageImage
                      ? null
                      : existingTask.readingContent.imageUrl,
                awardingBody:
                  dto.awardingBody ?? existingTask.readingContent.awardingBody,
                passLogic:
                  dto.passLogic ?? existingTask.readingContent.passLogic,
                passMark: dto.passMark ?? existingTask.readingContent.passMark,
              },
            });
          } else {
            await tx.readingTask.create({
              data: {
                taskId,
                content: dto.content ?? '',
                entryType: dto.entryType ?? [],
                passLogic: dto.passLogic,
                imageUrl: newPassageImageUrl,
              },
            });
          }
        }
      }

      if (existingTask.type === 'GRAMMAR') {
        const shouldUpdateGrammar =
          dto.content !== undefined || dto.entryType !== undefined;

        if (shouldUpdateGrammar) {
          if (existingTask.grammarContent) {
            await tx.grammarTask.update({
              where: { taskId },
              data: {
                content: dto.content ?? existingTask.grammarContent.content,
                entryType:
                  dto.entryType ?? existingTask.grammarContent.entryType,
              },
            });
          } else {
            await tx.grammarTask.create({
              data: {
                taskId,
                content: dto.content ?? '',
                entryType: dto.entryType ?? [],
              },
            });
          }
        }
      }

      /**
       * update base task
       */
      await tx.task.update({
        where: { id: taskId },
        data: {
          title: dto.title ?? existingTask.title,
          type: dto.type ?? existingTask.type,
          folderId: dto.folderId !== undefined ? dto.folderId : existingTask.folderId,
          isPublic:
            role === 'admin'
              ? (dto.isPublic ?? existingTask.isPublic)
              : existingTask.isPublic,
          isPremium:
            role === 'admin'
              ? (dto.isPremium ?? existingTask.isPremium)
              : existingTask.isPremium,
          status:
            role === 'admin'
              ? (dto.status ?? existingTask.status)
              : existingTask.status,
          timeLimit: dto.timeLimit !== undefined ? dto.timeLimit : existingTask.timeLimit,
          feedbackMode: dto.feedbackMode !== undefined ? dto.feedbackMode : existingTask.feedbackMode,
        },
      });

      /**
       * Re-sequence the whole task's questions grouped by type so that after
       * adds/deletes the ordering is always contiguous (1..N) with all MCQs
       * first, then all gap-fills, etc. — no gaps, no cross-type collisions.
       */
      await this.normalizeTaskQuestionOrder(tx, taskId);

      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: {
          readingContent: true,
          grammarContent: true,
          vocabularyItems: true,
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return { ...task, createdQuestions };
    });
  }

  // Deterministic display/answer ordering: questions are grouped by type in this
  // priority, and numbered 1..N across the whole task.
  private static readonly QUESTION_TYPE_ORDER: QuestionType[] = [
    QuestionType.MCQ,
    QuestionType.GAP_FILL,
    QuestionType.WORD_BOX_MATCH,
    QuestionType.MATCHING,
    QuestionType.QUESTION_ANSWER,
    QuestionType.ORDERING,
  ];

  private async normalizeTaskQuestionOrder(tx: any, taskId: string) {
    const questions = await tx.question.findMany({
      where: { taskId },
      select: { id: true, type: true, order: true, createdAt: true },
    });

    const priority = (t: QuestionType) => {
      const idx = TaskService.QUESTION_TYPE_ORDER.indexOf(t);
      return idx === -1 ? TaskService.QUESTION_TYPE_ORDER.length : idx;
    };

    const sorted = [...questions].sort((a, b) => {
      const pa = priority(a.type);
      const pb = priority(b.type);
      if (pa !== pb) return pa - pb;
      if (a.order !== b.order) return a.order - b.order;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    for (let i = 0; i < sorted.length; i++) {
      const desired = i + 1;
      if (sorted[i].order !== desired) {
        await tx.question.update({
          where: { id: sorted[i].id },
          data: { order: desired },
        });
      }
    }
  }

  async addQuestionsToTask(taskId: string, questions: AddQuestionsDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { questions: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.questions.length > 0) {
      throw new ConflictException('Questions already added to this task');
    }
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        questions: {
          createMany: {
            data: questions.questions.map((q) => ({
              type: q.type as QuestionType,
              order: q.order,
              config:
                typeof q.config === 'string' ? JSON.parse(q.config) : q.config,
            })),
          },
        },
      },
      include: {
        questions: true,
        vocabularyItems: true, // Useful to see the words associated
      },
    });
  }

  async getTasksWords(taskId: string, search?: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        vocabularyItems: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (search) {
      task.vocabularyItems = task.vocabularyItems.filter((item) =>
        item.wordName.toLowerCase().includes(search.toLowerCase()),
      );
    }
    return task.vocabularyItems;
  }

  async findAll(role: string, userId: string, query: TaskQueryDto) {
    const { page = 1, limit = 10, status, folderId } = query;

    const where: any = {};

    if (status) where.status = status;
    if (query.isPremium !== undefined) where.isPremium = query.isPremium;
    if (folderId !== undefined) {
      where.folderId = folderId === 'null' ? null : folderId;
    }

    if (role === 'teacher') {
      where.OR = [
        { createdById: userId },
        { isPublic: true, status: 'APPROVED' },
      ];
    }

    const [rawData, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: {
          createdBy: { select: { email: true, firstName: true, lastName: true } },
          // Teachers only see which of THEIR OWN classes use this task
          // (a shared/public task may be attached to other teachers'
          // classes too, which shouldn't be exposed). Admins see all.
          classTasks: {
            where: role === 'teacher' ? { class: { teacherId: userId } } : undefined,
            select: { class: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.task.count({ where }),
    ]);

    const data = rawData.map(({ classTasks, ...task }) => ({
      ...task,
      classes: classTasks.map((ct) => ct.class),
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        readingContent: true,
        grammarContent: true,
        vocabularyItems: true,
        questions: { orderBy: { order: 'asc' } },
      },
    });

    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async updateStatus(id: string, status: any) {
    return this.prisma.task.update({
      where: { id },
      data: { status },
    });
  }

  async deleteTask(id: string, user: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
    });
    
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (user.role !== 'admin' && task.createdById !== user.sub) {
      throw new ForbiddenException('You can only delete your own tasks');
    }

    await this.prisma.task.delete({
      where: { id },
    });
    
    return { success: true };
  }

  async getAllScheduledTasks(user: any, pagination: PaginationQueryDto) {
    const role = user.role;
    const userId = user.sub;

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const skip = (page - 1) * limit;

    // -----------------------------
    // WHERE FILTER
    // -----------------------------
const where =
  role === 'student'
    ? {
        isActive: true,
        classTask: {
          class: {
            students: {
              some: {
                id: userId,
              },
            },
          },
        },
      }
    : {
        classTask: {
          class: {
            teacherId: userId,
          },
        },
      };
    // -----------------------------
    // QUERY
    // -----------------------------
    const [scheduledTasks, total] = await this.prisma.$transaction([
      this.prisma.classScheduledTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },

        include: {
          classTask: {
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                  teacherId: true,
                  _count: {
                    select: {
                      students: true,
                    },
                  },
                },
              },
              task: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  _count: {
                    select: {
                      questions: true,
                    },
                  },
                },
              },
            },
          },

          attempts: {
            where:
              role === 'student'
                ? { studentId: userId }
                : { status: 'COMPLETED' },

            select: {
              id: true,
              status: true,
              _count: {
                select: {
                  answers: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.classScheduledTask.count({ where }),
    ]);

    // -----------------------------
    // RESPONSE MAPPING
    // -----------------------------
    const data = scheduledTasks.map((st) => {
      const className = st.classTask.class.name;
      const totalStudents = st.classTask.class._count.students;
      const totalQuestions = st.classTask.task._count.questions;

      // -----------------------------
      // TEACHER VIEW
      // -----------------------------
      if (role !== 'student') {
        const completedStudents = st.attempts.length;

        const completionRate =
          totalStudents === 0
            ? 0
            : Math.round((completedStudents / totalStudents) * 100);

        return {
          scheduledTaskId: st.id,
          title: st.classTask.task.title,
          type: st.classTask.task.type,

          className,

          totalQuestions,
          totalStudents,
          completedStudents,
          completionRate,

          scheduledAt: st.scheduledAt,
          dueAt: st.dueAt,
        };
      }

      // -----------------------------
      // STUDENT VIEW
      // -----------------------------
      const attempt = st.attempts[0];

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
        scheduledTaskId: st.id,
        title: st.classTask.task.title,
        type: st.classTask.task.type,

        className,

        totalQuestions,
        answeredQuestions,
        progressPercentage,
        status,

        scheduledAt: st.scheduledAt,
        dueAt: st.dueAt,
      };
    });

    // -----------------------------
    // FINAL RESPONSE
    // -----------------------------
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }  async importPdf(file: Express.Multer.File) {
    if (!file) throw new NotFoundException('No file provided');

    console.log('--- DOCUMENT RECEIVED ---', file.originalname, file.size, 'bytes');

    // Parse the document text
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    let rawText = '';
    if (extension === 'txt') {
      rawText = file.buffer.toString('utf-8');
    } else if (extension === 'doc') {
      const WordExtractor = require('word-extractor');
      const extracted = await new WordExtractor().extract(file.buffer);
      rawText = extracted.getBody();
    } else {
      const { parseOffice } = require('officeparser');
      const ast = await parseOffice(file.buffer, { fileType: extension as any });
      rawText = ast.toText();
    }

    const prompt = `You are an expert UK ESOL exam paper parser. Your task is to extract a structured JSON representation from the OCR text of an exam paper.

## CONTEXT
These are official UK ESOL (English for Speakers of Other Languages) Skills for Life examination papers used in adult education. They are produced by UK awarding bodies including:
- **Ascentis** – uses criteria codes like 1.1, 1.2, 2.1, 3.1, 3.2, 3.3, 3.4, 4.1
- **ESB (English Speaking Board)** – uses codes like 1.1, 3.1, 4.1 etc. in a grid on the cover page
- **Gateway Qualifications**
- **Trinity College London**

Papers are structured into Tasks (Task 1, Task 2, Task 3). Each Task has a short reading passage and 6–8 questions. Papers range from Entry Level 1 to Level 2.

Some papers are **Tutor / Assessor Copies** — these include printed answer keys below each question (e.g. "Answer: c having a holiday" or "Answer: True"). If you see these, extract the correct answer and set correctIndex accordingly.

## OUTPUT FORMAT
Return a single JSON object with exactly two arrays: "sections" and "questions". No markdown, no code fences — raw JSON only.

---

## STEP 1 — Extract "sections"
Each section corresponds to one Task in the paper (e.g. "Task 1", "Task 2", "Task 3").

Rules:
- The "title" is exactly what the paper says (e.g. "Task 1", "Task 2").
- The "instruction" is the task instruction (e.g. "Read the postcard. Then answer questions 1 to 8.").
- Do NOT include the reading passage text in "content" — leave it as an empty string "". The teacher will attach reading images separately.
- Generate a proper random UUID v4 for every "id".

Section format:
{
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "title": "Task 1",
  "instruction": "Read the text and answer the questions.",
  "content": ""
}

---

## STEP 2 — Extract "questions"
Extract every question a student must answer. Do NOT extract answer keys, marking grids, instructions to invigilators, page numbers, centre information, candidate details fields, or Adult ESOL Core Curriculum reference codes (e.g. Rt/E1.1a, Rs/E1.1a–b).

Rules for all questions:
- Generate a proper random UUID v4 for every "id".
- Every "sectionId" MUST exactly match the "id" of one of the sections you created in Step 1.
- Strip leading question numbers (e.g. remove "1." or "7 " from the start).
- Preserve special symbols exactly as written (£, $, %, &, @, –, —).
- Wrap question text in <p></p> HTML tags.
- Default "marks" to 1 unless the paper states otherwise.
- If this is a Tutor Copy with printed answers, set the correct "correctIndex" based on the answer key. Otherwise set "correctIndex" to 0 as a placeholder.

---

## QUESTION TYPE DECISION RULES

### TRUE_FALSE
Use when: The question presents a statement and asks if it is True or False, or asks "Yes/No" (e.g. "Is this true or false?", "Tick True or False", "Can you pay by card? Yes No").
Format:
{
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "sectionId": "the-matching-section-id",
  "type": "TRUE_FALSE",
  "content": "<p>The statement as written in the paper.</p>",
  "marks": 1,
  "config": {
    "options": ["True", "False"],
    "correctIndex": 0
  }
}

### MCQ
Use when: The question lists multiple labelled options (a, b, c, d or A, B, C, D) and asks to "Tick one box", "Circle the letter", or "Choose the correct answer".
- Do NOT include the option letters (a, b, c) in the extracted options array — just the text.
Format:
{
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "sectionId": "the-matching-section-id",
  "type": "MCQ",
  "content": "<p>The question text.</p>",
  "marks": 1,
  "config": {
    "options": ["Option text 1", "Option text 2", "Option text 3", "Option text 4"],
    "correctIndex": 0
  }
}

### GAP_FILL
Use when: A sentence has a blank in the middle that the student must fill in. Blanks may appear as underscores (_______), a dotted line, or empty space within a sentence.
- If the paper provides word choices for the blank, include them in options.
- If no choices are given, omit the "config" property entirely.
Format with options:
{
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "sectionId": "the-matching-section-id",
  "type": "GAP_FILL",
  "content": "<p>The sentence with _____ for the blank.</p>",
  "marks": 1,
  "config": {
    "options": ["word1", "word2", "word3"]
  }
}

Format without options:
{
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "sectionId": "the-matching-section-id",
  "type": "GAP_FILL",
  "content": "<p>The sentence with _____ for the blank.</p>",
  "marks": 1
}

### QUESTION_ANSWER
Use when: The question asks for a short written answer (e.g. "What house number does Jane live at?", "Write the word.", "Write the time."). There are no multiple choice options.
Format:
{
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "sectionId": "the-matching-section-id",
  "type": "QUESTION_ANSWER",
  "content": "<p>The full question as written.</p>",
  "marks": 1
}

### INSTRUCTION (Convert to QUESTION_ANSWER)
IMPORTANT: This is a digital platform. Students read the passage as an image and cannot physically underline, circle, or draw on the paper. Therefore, NEVER output type "INSTRUCTION". Instead, convert all such questions into QUESTION_ANSWER by rephrasing them as a written question.

Conversion rules:
- "Underline the postcode." → "What is the postcode? Write it below."
- "Circle the telephone number." → "What is the telephone number? Write it below."
- "Underline the date in the text." → "What is the date? Write it below."
- "Circle the word that means X." → "Which word in the text means X? Write it below."
- Follow this pattern: identify WHAT the student is supposed to find, then rephrase as "What is the [thing]? Write it below."

Use QUESTION_ANSWER format:
{
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "sectionId": "the-matching-section-id",
  "type": "QUESTION_ANSWER",
  "content": "<p>What is the postcode? Write it below.</p>",
  "marks": 1
}

---

## IGNORE COMPLETELY
- Cover page details: candidate name, date, centre name, booking number, candidate number
- Invigilator instructions: "Do not open this paper until...", "You must not use a dictionary..."
- Marking grids and criteria tables on the cover
- Page headers and footers (e.g. "Page 2 of 7", "Version 1.0, Oct 19, BM, Set F Entry 1")
- Adult ESOL Core Curriculum codes (e.g. Rt/E1.1a, Rw/E1.3b)
- Ascentis/ESB criteria tick boxes and assessor signature blocks
- Any text that is clearly part of the reading passage context (not a question)

---

Exam Text:
${rawText}

Return only the raw JSON object. No markdown. No explanation. No code fences.`;

    const geminiHeaders = {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json',
    };

    let responseText = '';

    try {
      // Primary: Gemini 3.6 Flash (fast & cheap)
      console.log('Trying Gemini 3.6 Flash...');
      const res = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
        { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { headers: geminiHeaders, timeout: 90000 }
      );
      responseText = res.data.candidates[0].content.parts[0].text;
      console.log('SUCCESS: Gemini 3.6 Flash');
    } catch (err: any) {
      // Fallback: Gemini 3.1 Pro Preview
      console.log(`Primary failed (${err.response?.status || err.code}). Falling back to Gemini 3.1 Pro...`);
      const res = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
        { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { headers: geminiHeaders, timeout: 90000 }
      );
      responseText = res.data.candidates[0].content.parts[0].text;
      console.log('SUCCESS: Gemini 3.1 Pro (fallback)');
    }

    const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) responseText = match[1];
    return JSON.parse(responseText.trim());
  }
}
