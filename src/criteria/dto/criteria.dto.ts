import {
  IsString,
  IsOptional,
} from 'class-validator';
import { PaginationQueryDto } from 'common/dto/pagination.dto';

export class CreateCriterionDto {
  @IsString()
  code!: string; // e.g., "Ra", "1.1"

  @IsString()
  description!: string; // e.g., "Identify the main points of short texts"
}

export class UpdateCriterionDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CriteriaQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // Search by code or description
}
