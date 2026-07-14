import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { SubmitAnswerDto } from './dto/attempt.dto';
import { judgeAnswer } from './judge/judge.engine';
import { resultBuilders } from './result-builder/result.engine';
import { sanitizeQuestion } from './sanitize/sanitize-question';
import { BadgeService } from 'src/badge/badge.service';

@Injectable()
export class AttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentBadgeService: BadgeService,
  ) {}

  private calculateFinalResult(attempt: any) {
    const { task, answers, score } = attempt;
    const reading = task.readingContent;

    // 1. Get all unique criteria assigned to this test
    const requiredCriteria = [
      ...new Set(
        task.questions.map((q) => q.criterion?.code).filter((code) => !!code),
      ),
    ] as string[];

    // 2. Get criteria achieved (student got the question correct)
    const achievedCriteria = [
      ...new Set(
        answers
          .filter((a) => a.isCorrect && a.question.criterion?.code)
          .map((a) => a.question.criterion.code),
      ),
    ] as string[];

    // 3. Find missing criteria
    const missingCriteria = requiredCriteria.filter(
      (c) => !achievedCriteria.includes(c),
    );

    // Check if they met all criteria (if none were required, this inherently passes criteria check)
    const allCriteriaMet =
      requiredCriteria.length > 0 ? missingCriteria.length === 0 : true;

    // Default: Score-based (for standard tasks, non-reading, or SCORE_ONLY logic)
    if (!reading || reading.passLogic === 'SCORE_ONLY') {
      const passMark =
        reading?.passMark ?? Math.floor(task.questions.length * 0.6);

      return {
        isPassed: score >= passMark,
        missingCriteria, // Calculated dynamically now
        achievedCriteria, // Calculated dynamically now
        requiredCriteria,
      };
    }

    let isPassed = false;

    // 4. Apply Awarding Body Logic (Used for CRITERIA_ONLY or CRITERIA_AND_SCORE logic)
    switch (reading.awardingBody) {
      case 'ESB': // ESB Logic: Must meet all criteria
        isPassed = allCriteriaMet;
        break;

      case 'ASCENTIS': // Ascentis Logic
      case 'GATEWAY': // Gateway Logic
        const reachScore = score >= (reading.passMark ?? 0);
        isPassed = allCriteriaMet && reachScore;
        break;

      default:
        isPassed = score >= (reading.passMark ?? 0);
    }

    return {
      isPassed,
      missingCriteria,
      achievedCriteria,
      requiredCriteria,
    };
  }

  private buildResult(attempt: any) {
    const total = attempt.task.questions.length;
    const score = attempt.score;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

    // 1. Prepare Exam Breakdown (Awarding Body Logic)
    // We only include this if the task is a READING task and has an awarding body assigned.
    const reading = attempt.task.readingContent;
    const examBreakdown = reading?.awardingBody
      ? {
          awardingBody: reading.awardingBody,
          passLogic: reading.passLogic,
          passMarkRequired: reading.passMark,
          // These fields were saved to the Attempt record during the processAnswer transaction
          isPassed: attempt.isPassed,
          achievedCriteria: attempt.achievedCriteria || [],
          missingCriteria: attempt.missingCriteria || [],
        }
      : null;

    // 2. Map individual question results
    const results = attempt.answers.map((answer: any) => {
      const question = attempt.task.questions.find(
        (q: any) => q.id === answer.questionId,
      );

      // Get the specific builder for the question type
      const builder =
        resultBuilders[question.type] ??
        (() => ({
          question: question.config?.question ?? '',
          userAnswer: answer.answerData,
          correctAnswers: [],
          note: null,
        }));

      const resultData = builder(question, answer);

      return {
        questionId: answer.questionId,
        type: question.type,
        correct: answer.isCorrect,
        order: question.order,
        // Include Criterion info so UI can show "Tested Skill: Ra (Main Point)"
        criterion: question.criterion
          ? {
              code: question.criterion.code,
              description: question.criterion.description,
            }
          : null,
        ...resultData,
      };
    });

    // 3. Return the comprehensive result object
    return {
      // Basic stats
      score,
      total,
      percentage,
      status: attempt.status,

      // Logic-based pass/fail
      // If it's an exam, we use the logic pass. If it's a standard task, we use percentage >= 60%
      isPassed: reading?.awardingBody ? attempt.isPassed : percentage >= 60,

      // Metadata
      completedAt: attempt.completedAt,

      // Breakdown of awarding body rules
      examBreakdown,

      // Detailed question-by-question list
      results: results.sort((a, b) => a.order - b.order),
    };
  }

  async startOrResumeAttempt(studentId: string, scheduledTaskId: string) {
    const schedule = await this.prisma.classScheduledTask.findUnique({
      where: { id: scheduledTaskId },
      include: { classTask: true },
    });

    if (!schedule || !schedule.isActive) {
      throw new BadRequestException('This task is not currently active.');
    }

    const attempt = await this.prisma.attempt.upsert({
      where: {
        studentId_scheduledTaskId: {
          studentId,
          scheduledTaskId,
        },
      },
      update: {}, // resume existing attempt
      create: {
        studentId,
        scheduledTaskId,
        taskId: schedule.classTask.taskId,
        status: 'IN_PROGRESS',
      },
    });

    return attempt;
  }
  async getAttemptState(attemptId: string, studentId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        task: {
          include: {
            readingContent: true,
            grammarContent: true,
            vocabularyItems: true,
            questions: {
              orderBy: { order: 'asc' },
              include: { criterion: true },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt || attempt.studentId !== studentId) {
      throw new NotFoundException();
    }

    const sanitizedQuestions = attempt.task.questions.map((q) =>
      sanitizeQuestion(q),
    );

    const baseResponse = {
      ...attempt,
      task: {
        ...attempt.task,
        questions: sanitizedQuestions,
      },
    };

    if (attempt.status === 'COMPLETED') {
      return {
        ...baseResponse,
        result: this.buildResult(attempt),
      };
    }

    return baseResponse;
  }

  async processAnswer(
    attemptId: string,
    studentId: string,
    dto: SubmitAnswerDto,
  ) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        task: {
          include: {
            questions: {
              include: { criterion: true },
              orderBy: { order: 'asc' },
            },
            readingContent: true,
          },
        },
        answers: { include: { question: { include: { criterion: true } } } },
      },
    });

    if (!attempt || attempt.studentId !== studentId)
      throw new ForbiddenException();

    if (attempt.status === 'COMPLETED')
      throw new BadRequestException('Attempt already finished');

    const currentQuestion =
      attempt.task.questions[attempt.currentQuestionIndex];

    if (currentQuestion.id !== dto.questionId) {
      throw new BadRequestException('Incorrect question sequence');
    }

    console.log(currentQuestion.config, 'from service');
    console.log(dto.answerData);

    const isCorrect = judgeAnswer(
      currentQuestion.type,
      currentQuestion.config,
      dto.answerData,
    );
    const isLastQuestion =
      attempt.currentQuestionIndex === attempt.task.questions.length - 1;

    const result = await this.prisma.$transaction(async (tx) => {
      // Create the answer record
      const newAnswer = await tx.studentAnswer.create({
        data: {
          attemptId,
          questionId: dto.questionId,
          answerData: dto.answerData,
          isCorrect,
        },
        include: { question: { include: { criterion: true } } },
      });

      // Update basic stats
      const newScore = isCorrect ? attempt.score + 1 : attempt.score;

      // Prepare final results if finished
      let finalUpdateData: any = {
        currentQuestionIndex: isLastQuestion
          ? attempt.currentQuestionIndex
          : { increment: 1 },
        score: isCorrect ? { increment: 1 } : undefined,
        status: isLastQuestion ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: isLastQuestion ? new Date() : null,
      };

      if (isLastQuestion) {
        // Run the Logic Engine
        const result = this.calculateFinalResult({
          ...attempt,
          score: newScore,
          answers: [...attempt.answers, newAnswer],
        });

        finalUpdateData.isPassed = result.isPassed;
        finalUpdateData.achievedCriteria = result.achievedCriteria;
        finalUpdateData.missingCriteria = result.missingCriteria;
      }

      const updatedAttempt = await tx.attempt.update({
        where: { id: attemptId },
        data: finalUpdateData,
      });
      if (isLastQuestion) {
        const totalQuestions = attempt.task.questions.length;

        const percentage =
          totalQuestions > 0
            ? Math.round((newScore / totalQuestions) * 100)
            : 0;

        const xpPerQuestion = attempt.task.xpPerQuestion ?? 5;
        const xpEarned = newScore * xpPerQuestion;

        // Update attempt analytics
        await tx.attempt.update({
          where: { id: attemptId },
          data: {
            xpEarned,
            percentage,
          },
        });

        // Update Student XP
        await tx.studentProfile.update({
          where: { userId: studentId },
          data: {
            totalXp: { increment: xpEarned },
          },
        });

        // Update Skill Progress
        const skill = attempt.task.type;

        const progress = await tx.studentSkillProgress.findUnique({
          where: {
            studentId_skill: {
              studentId,
              skill,
            },
          },
        });

        if (!progress) {
          await tx.studentSkillProgress.create({
            data: {
              studentId,
              skill,
              totalTasks: 1,
              completedTasks: 1,
              totalScore: percentage,
              avgScore: percentage,
            },
          });
        } else {
          const newTotalTasks = progress.totalTasks + 1;
          const newCompleted = progress.completedTasks + 1;
          const newTotalScore = progress.totalScore + percentage;
          const newAvg = newTotalScore / newCompleted;

          await tx.studentSkillProgress.update({
            where: {
              studentId_skill: {
                studentId,
                skill,
              },
            },
            data: {
              totalTasks: newTotalTasks,
              completedTasks: newCompleted,
              totalScore: newTotalScore,
              avgScore: newAvg,
            },
          });
        }

        // Create Activity
        await tx.studentActivity.create({
          data: {
            studentId,
            type: 'TASK_COMPLETED',
            scheduledTaskId: attempt.scheduledTaskId,
            attemptId: attemptId,
            xpEarned,
            message: `Completed ${attempt.task.title}`,
          },
        });

        // Update Monthly Stats
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const stats = await tx.studentMonthlyStats.findUnique({
          where: {
            studentId_month_year: {
              studentId,
              month,
              year,
            },
          },
        });

        if (!stats) {
          await tx.studentMonthlyStats.create({
            data: {
              studentId,
              month,
              year,
              completedTasks: 1,
              xpEarned,
              overallScoreAvg: percentage,
            },
          });
        } else {
          const newTasks = stats.completedTasks + 1;
          const newXp = stats.xpEarned + xpEarned;

          await tx.studentMonthlyStats.update({
            where: {
              studentId_month_year: {
                studentId,
                month,
                year,
              },
            },
            data: {
              completedTasks: newTasks,
              xpEarned: newXp,
            },
          });
        }
      }

      return { isCorrect, isLastQuestion, status: updatedAttempt.status };
    });
    if (result.isLastQuestion) {
      const earnedBadges =
        await this.studentBadgeService.checkAndAwardBadges(studentId);

      return {
        ...result,
        earnedBadges,
      };
    }

    return result;
  }
}
