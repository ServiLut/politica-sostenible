import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CommitmentStatus } from '../../../prisma/generated/prisma';

export class UpdateCommitmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(CommitmentStatus)
  status?: CommitmentStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  ownerId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId?: string | null;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
