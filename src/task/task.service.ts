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
import { OpenAIService } from './openai.service';

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly openaiService: OpenAIService,
  ) {}

  async createTask(
    dto: CreateTaskDto,
    userId: string,
    status: any,
    role: string,
    files?: Express.Multer.File[],
    passageImage?: Express.Multer.File,
  ) {
    // Process base64 temporary context images in content
    if (dto.content && typeof dto.content === 'string' && dto.content.includes('data:image/')) {
      try {
        const parsedContent = JSON.parse(dto.content);
        if (parsedContent.sections) {
          for (const section of parsedContent.sections) {
            if (section.imageUrl && section.imageUrl.startsWith('data:image/')) {
              // Convert base64 to buffer
              const base64Data = section.imageUrl.replace(/^data:image\/\w+;base64,/, "");
              const buffer = Buffer.from(base64Data, 'base64');
              const dummyFile = {
                buffer,
                originalname: 'context_image.png',
                mimetype: 'image/png',
                size: buffer.length
              } as Express.Multer.File;
              // Upload to permanent storage
              section.imageUrl = await this.uploadService.uploadSingleImage(dummyFile, 'task_images');
            }
          }
          dto.content = JSON.stringify(parsedContent);
        }
      } catch (err) {
        console.error("Failed to process base64 images in content", err);
      }
    }

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
    
    // Only run local extraction if we are using Gemini (or not OpenAI)
    if (process.env.AI_PROVIDER !== 'openai') {
      if (extension === 'txt') {
        rawText = file.buffer.toString('utf-8');
      } else if (extension === 'doc') {
        const WordExtractor = require('word-extractor');
        const extracted = await new WordExtractor().extract(file.buffer);
        rawText = extracted.getBody();
      } else {
        const { parseOffice } = require('officeparser');
        const ast = await parseOffice(file.buffer, { fileType: extension as any });
      }
    }    const prompt = `You are a highly accurate UK ESOL exam digitization assistant.
Your goal is to extract the logical structure of this paper, preserving meaning, digitizing all questions and answers, and identifying the exact visual boundaries of all reading context materials.

## 1. CRITICAL: TOKEN REDUCTION & OUTPUT FORMAT
- MINIFY JSON: Return a single dense string with NO newlines, NO spaces outside of string values, and NO indentation.
- PRUNE EMPTY FIELDS: Do NOT output empty arrays (\`[]\`), nulls, or unnecessary keys.
- MCQ DEDUPLICATION: For MCQs, output ONLY \`options\` and \`correctIndex\` inside \`config\`. Do NOT include a redundant \`answer\` string.
- NON-MCQs: For \`GAP_FILL\` or \`QUESTION_ANSWER\`, emit only \`"config": { "answer": "..." }\`.
- EVIDENCE: Keep 'evidence' ultra-short (max 2-5 words).

## 2. DOCUMENT IDENTIFICATION
Determine the documentType: "CANDIDATE_PAPER", "TUTOR_COPY", "ASSESSOR_PACK", "SAMPLE_PAPER", "PRACTICE_PAPER", or "UNKNOWN".
If one PDF contains candidate content mixed with assessor notes, distinguish them.

## 3. SECTION & QUESTION EXTRACTION
- Extract every Task/Section title (e.g. "Task 1") and its overall instruction.
- Extract every question. Preserve original numbering and order.
- Do NOT extract repeated headers, footers, page numbers, marking grids, or candidate detail boxes.
- NEVER invent sections or question numbers.

## 4. PAPER-TO-DIGITAL TRANSFORMATION (CRITICAL)
Convert physical interactions into digital-friendly questions while preserving the exact meaning:
- Physical: "Underline the postcode." -> Digital: "What is the postcode? Write it below."
- Physical: "Tick two boxes." -> Digital: "Which two options are correct?" (Use MCQ if choices exist).
Do NOT invent fake MCQ options if none exist. Use QUESTION_ANSWER instead.

## 5. ANSWER EXTRACTION & VERIFICATION
For every question, determine 'answerState':
- PRINTED: Use ONLY when there is strong evidence it is the official printed answer key.
- AI_SOLVED: If no official answer is printed, read the source text and solve it using ONLY document evidence.
- UNKNOWN: If there is not enough evidence to solve it. NEVER GUESS.
Set 'evidence' to an ultra-concise citation (max 2-5 words, e.g. "Header date", "Line 4 text").

## 6. CONTEXT DETECTION & BOUNDARY RULES (CRITICAL)
For every reading passage / context item (cards, letters, postcards, advertisements, notices, articles):
- "page": Exact 1-indexed page number.
- "box_2d": [ymin, xmin, ymax, xmax] as normalized integers from 0 to 1000 (0 = top/left edge, 1000 = bottom/right edge).
- "purpose": Brief description (e.g. "Task 1 Postcard").
- "confidence": "HIGH", "MEDIUM", or "LOW".

BOUNDARY CALCULATION RULES:
1. OUTERMOST VISUAL FRAME FIRST: If an outer border, frame, card shape, or decorative boundary exists (e.g., striped airmail postcard borders, black stroke boxes), encompass the ENTIRE outer border. Coordinates must sit completely OUTSIDE the border lines with a 10–20 unit breathing margin.
2. LETTERS & FORMAL DOCUMENTS: Passage ALWAYS starts at the topmost sender address / hospital header (NOT at "Dear ...") and extends through the bottom signature/printed name.
3. POSTCARDS & ADS: Include all stamps, postmarks, recipient addresses, logos, accessibility/parking icons, URLs, and phone numbers.
4. EXAM INSTRUCTIONS EXCLUSION: Generic instructions above the container (e.g., "Task 1 (Guide time...)", "Read the text...") are NOT part of the context. ymin starts immediately above the container's top border.

## 7. OUTPUT SCHEMA
Return ONLY valid JSON matching this structure:
{
  "documentType": "CANDIDATE_PAPER",
  "sections": [
    {
      "sectionIndex": 1,
      "title": "Task 1",
      "instruction": "Read the text and answer questions 1 to 5.",
      "contextRegions": [
        {
          "page": 2,
          "box_2d": ["ymin_int", "xmin_int", "ymax_int", "xmax_int"],
          "purpose": "Task 1 Postcard",
          "confidence": "HIGH"
        }
      ]
    }
  ],
  "questions": [
    {
      "sectionIndex": 1,
      "type": "MCQ",
      "content": "What is the date of the event?",
      "marks": 1,
      "answerState": "AI_SOLVED",
      "confidence": "HIGH",
      "evidence": "Header date",
      "config": {
        "options": ["10th October", "12th October", "14th October"],
        "correctIndex": 1
      }
    },
    {
      "sectionIndex": 1,
      "type": "GAP_FILL",
      "content": "The doctor is available on [gap].",
      "marks": 1,
      "answerState": "AI_SOLVED",
      "confidence": "HIGH",
      "evidence": "Notice line 2",
      "config": {
        "answer": "Tuesday"
      }
    }
  ]
}\`;
}`;

    let responseText = '';
    let metadata: any = {};

    if (process.env.AI_PROVIDER === 'openai') {
      try {
        const aiResult = await this.openaiService.extractPdf(prompt, file);
        responseText = aiResult.responseText;
        metadata = aiResult.metadata;
      } catch (err: any) {
        console.error('OpenAI failed:', err.response?.data || err.message);
        throw err;
      }
    } else {
      const geminiHeaders = {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      };

      const prepStart = performance.now();
      const pdfBase64 = file.buffer.toString('base64');
      const prepTime = ((performance.now() - prepStart) / 1000).toFixed(3);

      const requestStart = performance.now();
      let firstChunkTime: number | null = null;
      let completeText = '';
      let usage: any = null;

      try {
        console.log(`[Gemini Pipeline] PDF Base64 Encoded in ${prepTime}s. Sending request to Gemini 3.6 Flash...`);
        const res = await axios.post(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
          { 
            contents: [{ 
              role: 'user', 
              parts: [
                { 
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: pdfBase64
                  }
                },
                { text: prompt }
              ] 
            }], 
            generationConfig: { 
              responseMimeType: 'application/json',
              temperature: 0.1,
              thinkingConfig: {
                thinkingBudget: 0,
              },
            } 
          },
          { 
            headers: geminiHeaders, 
            timeout: 120000 
          }
        );

        const totalEnd = performance.now();
        const totalApi = ((totalEnd - requestStart) / 1000).toFixed(2);
        const usage = res.data.usageMetadata;
        responseText = res.data.candidates[0].content.parts[0].text;

        console.log(`\n================= GEMINI API BENCHMARK =================`);
        console.log(`⚡ PDF Prep / Base64:       ${prepTime}s`);
        console.log(`⏱️  Total API Latency:       ${totalApi}s`);
        console.log(`📥 Input Tokens (PDF):      ${usage?.promptTokenCount?.toLocaleString() ?? 'N/A'}`);
        console.log(`📤 Output Tokens (JSON):    ${usage?.candidatesTokenCount?.toLocaleString() ?? 'N/A'}`);
        console.log(`📊 Total Tokens:            ${usage?.totalTokenCount?.toLocaleString() ?? 'N/A'}`);
        console.log(`========================================================\n`);

        metadata = {
          prepTime: `${prepTime}s`,
          latency: `${totalApi}s`,
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0
        };
      } catch (err: any) {
        console.error('Gemini 3.6 Flash failed:', err.response?.data || err.message);
        throw new Error(`Gemini 3.6 Flash error: ${err.response?.data?.error?.message || err.message}`);
      }
    }

    const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) responseText = match[1];

    let parsed;
    try {
      const { jsonrepair } = require('jsonrepair');
      const repaired = jsonrepair(responseText.trim());
      parsed = JSON.parse(repaired);
    } catch (err: any) {
      console.error("JSON Parsing failed!");
      const match = err.message.match(/position (\d+)/);
      if (match) {
        const pos = parseInt(match[1], 10);
        const snippet = responseText.substring(Math.max(0, pos - 50), Math.min(responseText.length, pos + 50));
        console.error(`Error around position ${pos}: ...${snippet}...`);
      }
      throw err;
    }
    // Backend Validation with Severity
    const validSectionsCount = parsed.sections ? parsed.sections.length : 0;
    const globalErrors: string[] = [];
    const globalWarnings: string[] = [];
    
    if (parsed.questions) {
      for (const q of parsed.questions) {
        q.validation = { errors: [], warnings: [], reviewRequired: [] };
        
        const validSectionIndices = parsed.sections ? parsed.sections.map((s: any) => s.sectionIndex) : [];
        if (typeof q.sectionIndex !== 'number' || !validSectionIndices.includes(q.sectionIndex)) {
          const msg = `Invalid sectionIndex ${q.sectionIndex}`;
          q.validation.errors.push(msg);
          globalErrors.push(msg);
        }
        
        if (q.type === 'MCQ') {
          if (!q.config || !q.config.options || q.config.options.length < 2) {
             const msg = "Invalid MCQ: Must have at least 2 options.";
             q.validation.errors.push(msg);
             globalErrors.push(msg);
          }
          if (q.config && typeof q.config.correctIndex === 'number') {
             if (q.config.correctIndex < 0 || q.config.correctIndex >= (q.config.options?.length || 0)) {
                 const msg = `MCQ correctIndex out of bounds: ${q.config.correctIndex}`;
                 q.validation.errors.push(msg);
                 globalErrors.push(msg);
             }
          }
        }
        
        if (q.answerState === 'UNKNOWN') {
           q.validation.reviewRequired.push("Answer is UNKNOWN. Teacher must solve.");
        }
        if (q.confidence === 'LOW') {
           q.validation.reviewRequired.push("Low confidence answer. Teacher review advised.");
        }
      }
    }
    
    parsed.validationReport = { errors: globalErrors, warnings: globalWarnings };

    // Process and normalize context regions
    if (parsed.sections?.some((s: any) => s.contextRegions?.length > 0)) {
      for (const section of parsed.sections) {
        if (section.contextRegions?.length > 0) {
          for (const r of section.contextRegions) {
            section.validation = section.validation || { errors: [], warnings: [], reviewRequired: [] };
            
            if (r.page < 1) {
              section.validation.errors.push("Invalid page number.");
              globalErrors.push("Invalid page number for context crop.");
              continue;
            }
            let left = typeof r.left === 'number' ? r.left : (r.x || 0);
            let top = typeof r.top === 'number' ? r.top : (r.y || 0);
            let right = typeof r.right === 'number' ? r.right : undefined;
            let bottom = typeof r.bottom === 'number' ? r.bottom : undefined;
            
            // Support Gemini native box_2d format: [ymin, xmin, ymax, xmax] scaled 0 to 1000
            if (Array.isArray(r.box_2d) && r.box_2d.length === 4) {
              const [ymin, xmin, ymax, xmax] = r.box_2d;
              top = Number((ymin / 1000).toFixed(4));
              left = Number((xmin / 1000).toFixed(4));
              bottom = Number((ymax / 1000).toFixed(4));
              right = Number((xmax / 1000).toFixed(4));
            }
            
            if (right === undefined) { right = left + (r.width || 0); }
            if (bottom === undefined) { bottom = top + (r.height || 0); }

            const width = Number((right - left).toFixed(4));
            const height = Number((bottom - top).toFixed(4));

            // Enrich contextRegion with full coordinates
            r.left = left;
            r.top = top;
            r.right = right;
            r.bottom = bottom;
            r.width = width;
            r.height = height;
            r.derivedWidth = width;
            r.derivedHeight = height;

            if (left < 0 || top < 0 || right > 1 || bottom > 1 || left >= right || top >= bottom) {
              section.validation.errors.push("Crop coordinates out of bounds or invalid.");
              globalErrors.push("Crop coordinates out of bounds.");
              console.warn(`⚠️ [Crop Warning] Coordinates out of bounds for section "${section.title}"`);
              continue;
            }
            if (r.confidence === 'LOW' || r.confidence === 'MEDIUM') {
              section.validation.reviewRequired.push(`Context crop confidence is ${r.confidence}. Please review boundaries.`);
            }
          }
        }
      }
    }

    const crypto = require('crypto');
    const uuidv4 = () => crypto.randomUUID();

    // Map sections
    const sectionsWithIds = (parsed.sections || []).map((s: any) => ({
      ...s,
      id: uuidv4(),
      content: s.content || "",
      imageUrl: s.imageUrl || ""
    }));

    // Map questions
    const questionsWithIds = (parsed.questions || []).map((q: any) => {
      const parentSection = sectionsWithIds.find((s: any) => s.sectionIndex === q.sectionIndex);
      const secId = parentSection ? parentSection.id : undefined;
      const { sectionIndex, ...rest } = q;
      return {
        ...rest,
        id: uuidv4(),
        sectionId: secId
      };
    });

    return {
      documentType: parsed.documentType || 'UNKNOWN',
      sections: sectionsWithIds,
      questions: questionsWithIds,
      validationReport: parsed.validationReport,
      metadata: typeof metadata !== 'undefined' ? metadata : {}
    };
  }
}
