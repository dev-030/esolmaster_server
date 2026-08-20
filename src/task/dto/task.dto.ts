import {
  IsEnum,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  ValidateIf,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { EntryType, TaskStatus, FeedbackMode } from 'src/database/prisma-client/enums';
import { PaginationQueryDto } from 'common/dto/pagination.dto';

export enum TaskType {
  READING = 'READING',
  WRITING = 'WRITING',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
  GRAMMAR = 'GRAMMAR',
  VOCABULARY = 'VOCABULARY',
}

export enum AwardingBody {
  ESB = 'ESB',
  ASCENTIS = 'ASCENTIS',
  GATEWAY = 'GATEWAY',
  TRINITY = 'TRINITY',
}

export class QuestionDto {
  @IsEnum(['MCQ', 'GAP_FILL', 'WORD_BOX_MATCH', 'MATCHING', 'QUESTION_ANSWER', 'ORDERING', 'TRUE_FALSE'])
  type!: string;

  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  order!: number;

  @IsString()
  config!: string;

  @IsOptional()
  @IsString()
  criterionId?: string; // Links to the Criterion table record
}

class WordItemDto {
  @IsString()
  wordName!: string;

  @IsString()
  definition!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsEnum(TaskType)
  type!: TaskType;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  // Admin-only: flag this task as premium (gated behind a package).
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  timeLimit?: number;

  @IsOptional()
  @IsEnum(FeedbackMode)
  feedbackMode?: FeedbackMode;

  @IsOptional()
  @IsEnum(AwardingBody)
  awardingBody?: AwardingBody;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  passMark?: number;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @IsEnum(EntryType, { each: true })
  entryType?: EntryType[];

  @IsOptional()
  @Transform(({ value }) => {
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (Array.isArray(parsed)) {
      return plainToInstance(WordItemDto, parsed);
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WordItemDto)
  words?: WordItemDto[];

  @ValidateIf((o) => o.type !== TaskType.VOCABULARY)
  @Transform(({ value }) => {
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (Array.isArray(parsed)) {
      return plainToInstance(QuestionDto, parsed);
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

export class AddQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

export class TaskQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsString()
  folderId?: string;
}
