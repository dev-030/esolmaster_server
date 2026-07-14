import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from 'common/dto/pagination.dto';
import { EntryType, TaskType } from 'src/database/prisma-client/enums';

export class ScheduledTaskQueryDto extends PaginationQueryDto {

  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @IsOptional()
  @IsEnum(EntryType)
  entryType?: EntryType;
}