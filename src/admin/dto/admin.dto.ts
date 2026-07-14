// dto

import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'common/dto/pagination.dto';
import { Role } from 'src/database/prisma-client/browser';


export class AdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  search?: string;
}