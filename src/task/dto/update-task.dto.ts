import {
  IsEnum,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  IsUUID,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  AwardingBody,
  EntryType,
  TaskStatus,
} from 'src/database/prisma-client/enums';

export class UpdateQuestionDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsEnum(['MCQ', 'GAP_FILL', 'WORD_BOX_MATCH', 'MATCHING', 'QUESTION_ANSWER', 'ORDERING'])
  type?: string;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  order?: number;

  @IsOptional()
  config?: any;

  @IsOptional()
  @IsString()
  criterionId?: string; // Add this
}

export class NewQuestionDto {
  @IsEnum(['MCQ', 'GAP_FILL', 'WORD_BOX_MATCH', 'MATCHING', 'QUESTION_ANSWER', 'ORDERING'])
  type!: string;

  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  order!: number;

  @IsOptional()
  config?: any;

  @IsOptional()
  @IsString()
  criterionId?: string; // Add this

  // Client-supplied temporary id so the frontend can reconcile the created
  // row's real id after an autosave (createMany does not return ids).
  @IsOptional()
  @IsString()
  clientKey?: string;
}

export class UpdateWordDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  wordName?: string;

  @IsOptional()
  @IsString()
  definition?: string;

  // used to map uploaded file to this item
  @IsOptional()
  @IsString()
  imageKey?: string;

  // remove existing image without uploading a new one
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  removeImage?: boolean;
}

export class NewWordDto {
  @IsString()
  wordName!: string;

  @IsString()
  definition!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  // used to map uploaded file to this new item
  @IsOptional()
  @IsString()
  imageKey?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(AwardingBody)
  awardingBody?: AwardingBody;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  passMark?: number;

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
  @IsString({ each: true })
  deleteQuestionIds?: string[];

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
      return plainToInstance(UpdateQuestionDto, parsed);
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuestionDto)
  updateQuestions?: UpdateQuestionDto[];

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
      return plainToInstance(NewQuestionDto, parsed);
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewQuestionDto)
  newQuestions?: NewQuestionDto[];

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
  @IsString({ each: true })
  deleteWordIds?: string[];

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
      return plainToInstance(UpdateWordDto, parsed);
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWordDto)
  updateWords?: UpdateWordDto[];

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
      return plainToInstance(NewWordDto, parsed);
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewWordDto)
  newWords?: NewWordDto[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  removePassageImage?: boolean;
}
