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
  CommunicationChannel,
  IssueCaseStatus,
  WorkPriority,
} from '../../../prisma/generated/prisma';

export class ListIssueCasesQueryDto {
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
  @IsEnum(IssueCaseStatus)
  status?: IssueCaseStatus;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

  @IsOptional()
  @IsEnum(CommunicationChannel)
  sourceChannel?: CommunicationChannel;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  assigneeId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  confidential?: 'true' | 'false';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
