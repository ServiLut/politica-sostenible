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
import {
  CommunicationApprovalStatus,
  CommunicationChannel,
} from '../../../prisma/generated/prisma';

const REVIEW_STATUSES = [
  CommunicationApprovalStatus.PENDING,
  CommunicationApprovalStatus.APPROVED,
  CommunicationApprovalStatus.REJECTED,
] as const;

export class ListCommunicationApprovalsQueryDto {
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
  @IsIn(REVIEW_STATUSES)
  status?: CommunicationApprovalStatus;

  @IsOptional()
  @IsEnum(CommunicationChannel)
  channel?: CommunicationChannel;

  @IsOptional()
  @IsIn(['true', 'false'])
  containsSensitiveData?: 'true' | 'false';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  requestedById?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
