import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CommitmentStatus } from '../../../prisma/generated/prisma';

export class ListCommitmentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(CommitmentStatus)
  status?: CommitmentStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  ownerId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  isPublic?: 'true' | 'false';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  targetFrom?: string;

  @IsOptional()
  @IsDateString()
  targetTo?: string;
}
