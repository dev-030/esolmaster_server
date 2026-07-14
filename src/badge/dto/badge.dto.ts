import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { BadgeConditionType } from 'src/database/prisma-client/enums';

export class CreateBadgeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  iconName!: string;

  @IsEnum(BadgeConditionType)
  conditionType!: BadgeConditionType;

  @IsObject()
  conditionConfig!: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}