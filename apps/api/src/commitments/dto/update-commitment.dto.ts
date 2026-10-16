import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CommitmentStatus } from '../../../prisma/generated/prisma';
import { IsOperationalDeadline } from '../../common/utils/operational-deadline';
import { IsCommitmentFulfillmentProgressValid } from './commitment-fulfillment-progress.validator';

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

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(CommitmentStatus)
  @IsCommitmentFulfillmentProgressValid(false)
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
  @IsOperationalDeadline()
  targetDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
