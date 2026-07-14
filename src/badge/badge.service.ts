import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateBadgeDto } from './dto/badge.dto';
import { BadgeConditionType } from 'src/database/prisma-client/browser';
import { AttemptStatus, Badge, Prisma } from 'src/database/prisma-client/client';

type EarnedBadgeWithBadge = Prisma.StudentBadgeGetPayload<{
  include: {
    badge: true;
  };
}>;
@Injectable()
export class BadgeService {

    constructor(private readonly prisma:PrismaService) {}
      async createBadge(dto: CreateBadgeDto) {
    this.validateBadgeConfig(dto.conditionType, dto.conditionConfig);

    return this.prisma.badge.create({
      data: {
        name: dto.name,
        description: dto.description,
        iconName: dto.iconName,
        conditionType: dto.conditionType,
        conditionConfig: dto.conditionConfig,
        isActive: dto.isActive ?? true,
      },
    });
  }

   async getBadges() {
    return this.prisma.badge.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

async getMyBadges(studentId: string) {
  const badges = await this.prisma.badge.findMany({
    where: {
      isActive: true,
    },
    include: {
      studentBadges: {
        where: {
          studentId,
        },
        select: {
          id: true,
          progress: true,
          earnedAt: true,
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return badges.map((badge) => {
    const studentBadge = badge.studentBadges[0];

    return {
      id: studentBadge?.id ?? null,
      badgeId: badge.id,
      progress: studentBadge?.progress ?? 0,
      earnedAt: studentBadge?.earnedAt ?? null,
      badge: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        iconName: badge.iconName,
        conditionType: badge.conditionType,
        conditionConfig: badge.conditionConfig,
        isActive: badge.isActive,
      },
    };
  });
}

  async getBadgeById(id: string) {
    return this.prisma.badge.findUnique({
      where: { id },
    });
  }

    async updateBadge(id: string, dto: Partial<CreateBadgeDto>) {
    if (dto.conditionType && dto.conditionConfig) {
      this.validateBadgeConfig(dto.conditionType, dto.conditionConfig);
    }

    return this.prisma.badge.update({
      where: { id },
      data: dto,
    });
  }

    async deleteBadge(id: string) {
    return this.prisma.badge.delete({
      where: { id },
    });
  }

  

   private validateBadgeConfig(
    type: BadgeConditionType,
    config: Record<string, any>,
  ) {
    switch (type) {
      case 'COMPLETE_TASKS_WITHIN_DAYS':
        if (!config.targetTasks || !config.withinDays) {
          throw new BadRequestException(
            'targetTasks and withinDays required',
          );
        }
        break;

      case 'SCORE_PERCENTAGE':
        if (!config.minPercentage) {
          throw new BadRequestException(
            'minPercentage required',
          );
        }
        break;

      case 'CONSECUTIVE_SCORE_PERCENTAGE':
        if (!config.minPercentage || !config.consecutiveTasks) {
          throw new BadRequestException(
            'minPercentage and consecutiveTasks required',
          );
        }
        break;

      case 'SCORE_PERCENTAGE_IN_TASKS_WITHIN_DAYS':
        if (
          !config.minPercentage ||
          !config.targetTasks ||
          !config.withinDays
        ) {
          throw new BadRequestException(
            'minPercentage, targetTasks and withinDays required',
          );
        }
        break;

      case 'XP_WITHIN_TIME':
        if (
          !config.targetXp ||
          (!config.withinHours && !config.withinDays)
        ) {
          throw new BadRequestException(
            'targetXp and withinHours or withinDays required',
          );
        }
        break;

      case 'STREAK_DAYS':
        if (!config.targetDays) {
          throw new BadRequestException(
            'targetDays required',
          );
        }
        break;

      case 'ATTEMPT_COUNT':
        if (!config.targetAttempts) {
          throw new BadRequestException(
            'targetAttempts required',
          );
        }
        break;
    }
  }

    async checkAndAwardBadges(studentId: string) {
    const badges = await this.prisma.badge.findMany({
      where: { isActive: true },
    });

const earnedBadges: EarnedBadgeWithBadge[] = [];

    for (const badge of badges) {
      const existing = await this.prisma.studentBadge.findUnique({
        where: {
          studentId_badgeId: {
            studentId,
            badgeId: badge.id,
          },
        },
      });

      if (existing?.earnedAt) continue;

      const progress = await this.calculateProgress(studentId, badge);
      const target = this.getTargetValue(badge);

      const earnedAt = progress >= target ? new Date() : null;

      const studentBadge = await this.prisma.studentBadge.upsert({
        where: {
          studentId_badgeId: {
            studentId,
            badgeId: badge.id,
          },
        },
        update: {
          progress,
          earnedAt,
        },
        create: {
          studentId,
          badgeId: badge.id,
          progress,
          earnedAt,
        },
        include: {
          badge: true,
        },
      });

      if (earnedAt) {
        earnedBadges.push(studentBadge);
      }
    }

    return earnedBadges;
  }

  private async calculateProgress(studentId: string, badge: Badge) {
    const config = badge.conditionConfig as any;

    switch (badge.conditionType) {
      case BadgeConditionType.COMPLETE_TASKS_WITHIN_DAYS:
        return this.prisma.attempt.count({
          where: {
            studentId,
            status: AttemptStatus.COMPLETED,
            completedAt: {
              gte: this.daysAgo(config.withinDays),
            },
          },
        });

      case BadgeConditionType.SCORE_PERCENTAGE: {
        const attempt = await this.prisma.attempt.findFirst({
          where: {
            studentId,
            status: AttemptStatus.COMPLETED,
            percentage: {
              gte: config.minPercentage,
            },
          },
        });

        return attempt ? config.minPercentage : 0;
      }

      case BadgeConditionType.CONSECUTIVE_SCORE_PERCENTAGE:
        return this.getConsecutiveScoreCount(
          studentId,
          config.minPercentage,
        );

      case BadgeConditionType.SCORE_PERCENTAGE_IN_TASKS_WITHIN_DAYS:
        return this.prisma.attempt.count({
          where: {
            studentId,
            status: AttemptStatus.COMPLETED,
            percentage: {
              gte: config.minPercentage,
            },
            completedAt: {
              gte: this.daysAgo(config.withinDays),
            },
          },
        });

      case BadgeConditionType.XP_WITHIN_TIME: {
        const startDate = config.withinHours
          ? this.hoursAgo(config.withinHours)
          : this.daysAgo(config.withinDays);

        const result = await this.prisma.attempt.aggregate({
          where: {
            studentId,
            status: AttemptStatus.COMPLETED,
            completedAt: {
              gte: startDate,
            },
          },
          _sum: {
            xpEarned: true,
          },
        });

        return result._sum.xpEarned ?? 0;
      }

      case BadgeConditionType.ATTEMPT_COUNT:
        return this.prisma.attempt.count({
          where: {
            studentId,
          },
        });

      case BadgeConditionType.STREAK_DAYS:
        return 0;

      default:
        return 0;
    }
  }

  private async getConsecutiveScoreCount(
    studentId: string,
    minPercentage: number,
  ) {
    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        status: AttemptStatus.COMPLETED,
      },
      select: {
        percentage: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    let count = 0;

    for (const attempt of attempts) {
      if ((attempt.percentage ?? 0) >= minPercentage) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }

  private getTargetValue(badge: Badge) {
    const config = badge.conditionConfig as any;

    switch (badge.conditionType) {
      case BadgeConditionType.COMPLETE_TASKS_WITHIN_DAYS:
        return config.targetTasks;

      case BadgeConditionType.SCORE_PERCENTAGE:
        return config.minPercentage;

      case BadgeConditionType.CONSECUTIVE_SCORE_PERCENTAGE:
        return config.consecutiveTasks;

      case BadgeConditionType.SCORE_PERCENTAGE_IN_TASKS_WITHIN_DAYS:
        return config.targetTasks;

      case BadgeConditionType.XP_WITHIN_TIME:
        return config.targetXp;

      case BadgeConditionType.STREAK_DAYS:
        return config.targetDays;

      case BadgeConditionType.ATTEMPT_COUNT:
        return config.targetAttempts;

      default:
        return 1;
    }
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private hoursAgo(hours: number) {
    const date = new Date();
    date.setHours(date.getHours() - hours);
    return date;
  }

}
