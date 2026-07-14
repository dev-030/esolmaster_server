import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsInt,
  Min,
  IsArray,
} from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsIn(['MONTHLY', 'ANNUAL'])
  @IsNotEmpty()
  billingCycle!: 'MONTHLY' | 'ANNUAL';
}

// Admin: create a package (subscription plan) — also synced to Stripe.
export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['FREE', 'BASIC', 'PRO'])
  type!: 'FREE' | 'BASIC' | 'PRO';

  @IsOptional()
  @IsString()
  description?: string;

  // Prices are in the smallest currency unit (e.g. cents).
  @IsInt()
  @Min(0)
  monthlyPrice!: number;

  @IsInt()
  @Min(0)
  annualPrice!: number;

  @IsOptional()
  @IsString()
  currency?: string; // default 'usd'

  @IsInt()
  @Min(0)
  maxClasses!: number;

  @IsInt()
  @Min(0)
  maxStudentsPerClass!: number;

  @IsInt()
  @Min(0)
  maxScheduledTasksInClass!: number;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  annualPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxClasses?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxStudentsPerClass?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxScheduledTasksInClass?: number;

  @IsOptional()
  isActive?: boolean;
}

export class AttachPremiumTasksDto {
  @IsArray()
  @IsString({ each: true })
  taskIds!: string[];
}
