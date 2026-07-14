import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  CreateCriterionDto,
  UpdateCriterionDto,
  CriteriaQueryDto,
} from './dto/criteria.dto';

@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCriterionDto) {
    // Check if criterion with same code already exists
    const existingCriterion = await this.prisma.criterion.findUnique({
      where: { code: dto.code },
    });

    if (existingCriterion) {
      throw new ConflictException(
        `Criterion with code "${dto.code}" already exists`,
      );
    }

    return this.prisma.criterion.create({
      data: {
        code: dto.code,
        description: dto.description,
      },
    });
  }

  async findAll(query: CriteriaQueryDto) {
    const { page = 1, limit = 10, search } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.criterion.findMany({
        where,
        include: {
          questions: {
            select: {
              id: true,
              order: true,
              type: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { code: 'asc' },
      }),
      this.prisma.criterion.count({ where }),
    ]);

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
    const criterion = await this.prisma.criterion.findUnique({
      where: { id },
      include: {
        questions: {
          select: {
            id: true,
            taskId: true,
            order: true,
            type: true,
          },
        },
      },
    });

    if (!criterion) {
      throw new NotFoundException(`Criterion with id "${id}" not found`);
    }

    return criterion;
  }

  async update(id: string, dto: UpdateCriterionDto) {
    const existingCriterion = await this.prisma.criterion.findUnique({
      where: { id },
    });

    if (!existingCriterion) {
      throw new NotFoundException(`Criterion with id "${id}" not found`);
    }

    // If updating code, check for uniqueness
    if (dto.code && dto.code !== existingCriterion.code) {
      const duplicateCode = await this.prisma.criterion.findUnique({
        where: { code: dto.code },
      });

      if (duplicateCode) {
        throw new ConflictException(
          `Criterion with code "${dto.code}" already exists`,
        );
      }
    }

    return this.prisma.criterion.update({
      where: { id },
      data: {
        code: dto.code ?? existingCriterion.code,
        description: dto.description ?? existingCriterion.description,
      },
      include: {
        questions: {
          select: {
            id: true,
            taskId: true,
            order: true,
            type: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    const criterion = await this.prisma.criterion.findUnique({
      where: { id },
      include: { questions: true },
    });

    if (!criterion) {
      throw new NotFoundException(`Criterion with id "${id}" not found`);
    }

    // Prevent deletion if questions are linked
    if (criterion.questions.length > 0) {
      throw new ConflictException(
        `Cannot delete criterion "${criterion.code}" because it is linked to ${criterion.questions.length} question(s). Please unlink or delete those questions first.`,
      );
    }

    return this.prisma.criterion.delete({
      where: { id },
    });
  }
}
